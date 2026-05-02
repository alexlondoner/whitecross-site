#!/usr/bin/env python3
"""
Export current booking and finance data from Firestore into CSV files.

Usage:
  python scripts/export_finance_snapshot.py --month 2026-05

Requirements:
  pip install firebase-admin
  export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import firebase_admin
from firebase_admin import credentials, firestore

BOOKING_DISABLED_BARBERS = {"manoj", "kadim"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export finance snapshot from Firestore")
    parser.add_argument("--tenant", default="whitecross", help="Tenant id under tenants/{tenant}")
    parser.add_argument("--month", default=None, help="Month filter in YYYY-MM (default: current month)")
    parser.add_argument("--output", default="exports", help="Output directory")
    return parser.parse_args()


def ensure_firestore() -> firestore.Client:
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.ApplicationDefault())
    return firestore.client()


def month_bounds(month_key: str) -> Tuple[dt.datetime, dt.datetime]:
    year, month = [int(p) for p in month_key.split("-")]
    start = dt.datetime(year, month, 1, 0, 0, 0, tzinfo=dt.timezone.utc)
    if month == 12:
        end = dt.datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=dt.timezone.utc)
    else:
        end = dt.datetime(year, month + 1, 1, 0, 0, 0, tzinfo=dt.timezone.utc)
    return start, end


def to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    txt = str(value).replace("GBP", "").replace("£", "").replace(",", "").strip()
    if txt == "":
        return 0.0
    try:
        return float(txt)
    except ValueError:
        return 0.0


def effective_revenue(booking: Dict[str, Any]) -> float:
    if booking.get("status") == "CHECKED_OUT":
        paid = to_float(booking.get("paidAmount"))
        if paid > 0:
            return paid
    price = to_float(booking.get("price"))
    if price > 0:
        return price
    return to_float(booking.get("paidAmount"))


def is_cash(booking: Dict[str, Any]) -> bool:
    method = str(booking.get("paymentMethod") or "").strip().lower()
    if method == "cash":
        return True
    if method:
        return False
    return str(booking.get("paymentType") or "").strip().upper() == "CASH"


def write_csv(path: Path, rows: Iterable[Dict[str, Any]], headers: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def normalize_dt(value: Any) -> dt.datetime | None:
    if value is None:
        return None
    if hasattr(value, "to_datetime"):
        value = value.to_datetime()
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.timezone.utc)
        return value
    if isinstance(value, str):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=dt.timezone.utc)
            return parsed
        except ValueError:
            return None
    return None


def main() -> None:
    args = parse_args()
    month_key = args.month or dt.datetime.now().strftime("%Y-%m")
    start, end = month_bounds(month_key)

    db = ensure_firestore()

    tenant = f"tenants/{args.tenant}"
    barbers_ref = db.collection(f"{tenant}/barbers")
    bookings_ref = db.collection(f"{tenant}/bookings")
    expenses_ref = db.collection(f"{tenant}/finance_expenses")
    payments_ref = db.collection(f"{tenant}/finance_payments")

    barber_docs = list(barbers_ref.stream())
    barbers = []
    barber_name_by_id: Dict[str, str] = {}
    for doc in barber_docs:
        data = doc.to_dict() or {}
        name = str(data.get("name") or "").strip()
        if not name:
            continue
        barbers.append(
            {
                "id": str(data.get("id") or doc.id),
                "docId": doc.id,
                "name": name,
                "active": data.get("active", True),
                "bookingEnabled": not (
                    data.get("active", True) is False
                    or name.strip().lower() in BOOKING_DISABLED_BARBERS
                ),
            }
        )
        barber_name_by_id[doc.id.lower()] = name
        if data.get("id"):
            barber_name_by_id[str(data["id"]).lower()] = name

    bookings_query = (
        bookings_ref.where("startTime", ">=", start)
        .where("startTime", "<", end)
    )
    booking_docs = list(bookings_query.stream())

    bookings_rows: List[Dict[str, Any]] = []
    daily_walkin: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for doc in booking_docs:
        b = doc.to_dict() or {}
        start_time = normalize_dt(b.get("startTime"))
        if not start_time:
            continue

        raw_barber = str(b.get("barberId") or "").strip().lower()
        barber_name = (
            str(b.get("barberName") or "").strip()
            or barber_name_by_id.get(raw_barber)
            or str(b.get("barberId") or "").strip()
        )

        revenue = effective_revenue(b)
        date_key = start_time.astimezone(dt.timezone.utc).strftime("%Y-%m-%d")
        source = str(b.get("source") or "website").strip().lower()

        if b.get("status") != "CANCELLED" and source == "walk_in":
            key = f"{barber_name} {'Cash' if is_cash(b) else 'Card'}"
            daily_walkin[date_key][key] += revenue

        bookings_rows.append(
            {
                "bookingId": doc.id,
                "date": start_time.astimezone(dt.timezone.utc).strftime("%Y-%m-%d"),
                "time": start_time.astimezone(dt.timezone.utc).strftime("%H:%M"),
                "barber": barber_name,
                "source": source,
                "status": b.get("status", ""),
                "paymentType": b.get("paymentType", ""),
                "paymentMethod": b.get("paymentMethod", ""),
                "price": to_float(b.get("price")),
                "paidAmount": to_float(b.get("paidAmount")),
                "tip": to_float(b.get("tip")),
                "effectiveRevenue": revenue,
                "clientName": b.get("clientName", ""),
            }
        )

    expenses_docs = list(expenses_ref.where("month", "==", month_key).stream())
    expense_rows = []
    for doc in expenses_docs:
        e = doc.to_dict() or {}
        expense_rows.append(
            {
                "id": doc.id,
                "date": e.get("date", ""),
                "month": e.get("month", ""),
                "kasaMasraf": to_float(e.get("kasaMasraf")),
                "bankaMasraf": to_float(e.get("bankaMasraf")),
            }
        )

    payment_docs = list(payments_ref.stream())
    payment_rows = []
    for doc in payment_docs:
        p = doc.to_dict() or {}
        paid_date = normalize_dt(p.get("date"))
        if not paid_date:
            continue
        if paid_date.strftime("%Y-%m") != month_key:
            continue
        payment_rows.append(
            {
                "id": doc.id,
                "date": paid_date.strftime("%Y-%m-%d"),
                "barberName": p.get("barberName", ""),
                "amount": to_float(p.get("amount")),
                "method": p.get("method", ""),
                "notes": p.get("notes", ""),
            }
        )

    barber_names = [b["name"] for b in barbers]
    daily_rows = []
    for date_key in sorted(daily_walkin.keys()):
        row: Dict[str, Any] = {"date": date_key}
        total_cash = 0.0
        total_card = 0.0
        for name in barber_names:
            cash_col = f"{name} Cash"
            card_col = f"{name} Card"
            cash_val = round(daily_walkin[date_key].get(cash_col, 0.0), 2)
            card_val = round(daily_walkin[date_key].get(card_col, 0.0), 2)
            row[cash_col] = cash_val
            row[card_col] = card_val
            total_cash += cash_val
            total_card += card_val
        row["Total Cash"] = round(total_cash, 2)
        row["Total Card"] = round(total_card, 2)
        row["Total Revenue"] = round(total_cash + total_card, 2)
        daily_rows.append(row)

    monthly_summary = []
    for b in barbers:
        name = b["name"]
        name_lower = name.lower()
        barber_bookings = [r for r in bookings_rows if str(r.get("barber", "")).lower() == name_lower and r.get("status") != "CANCELLED"]
        worked_days = len({r["date"] for r in barber_bookings})
        total_revenue = round(sum(float(r["effectiveRevenue"]) for r in barber_bookings), 2)
        advances = round(sum(float(p["amount"]) for p in payment_rows if str(p.get("barberName", "")).lower() == name_lower), 2)
        monthly_summary.append(
            {
                "barber": name,
                "active": b["active"],
                "bookingEnabled": b["bookingEnabled"],
                "workedDays": worked_days,
                "totalRevenue": total_revenue,
                "totalAdvances": advances,
            }
        )

    out_dir = Path(args.output) / f"finance_snapshot_{month_key}"
    write_csv(
        out_dir / "barbers.csv",
        monthly_summary,
        ["barber", "active", "bookingEnabled", "workedDays", "totalRevenue", "totalAdvances"],
    )
    write_csv(
        out_dir / "bookings_raw.csv",
        bookings_rows,
        [
            "bookingId", "date", "time", "barber", "source", "status",
            "paymentType", "paymentMethod", "price", "paidAmount", "tip",
            "effectiveRevenue", "clientName",
        ],
    )

    daily_headers = ["date"]
    for name in barber_names:
        daily_headers.extend([f"{name} Cash", f"{name} Card"])
    daily_headers.extend(["Total Cash", "Total Card", "Total Revenue"])
    write_csv(out_dir / "daily_walkin_cash_card.csv", daily_rows, daily_headers)

    write_csv(
        out_dir / "expenses.csv",
        expense_rows,
        ["id", "date", "month", "kasaMasraf", "bankaMasraf"],
    )
    write_csv(
        out_dir / "payments.csv",
        payment_rows,
        ["id", "date", "barberName", "amount", "method", "notes"],
    )

    print(f"Export complete: {out_dir.resolve()}")
    print("Files: barbers.csv, bookings_raw.csv, daily_walkin_cash_card.csv, expenses.csv, payments.csv")


if __name__ == "__main__":
    main()
