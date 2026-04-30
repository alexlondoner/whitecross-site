import React, { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const TENANT = 'whitecross';

export default function Gallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  // modal state
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('upload'); // 'upload' | 'link'
  const [caption, setCaption] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [linkPreview, setLinkPreview] = useState(false);

  // edit modal state
  const [editModal, setEditModal] = useState(false);
  const [editImage, setEditImage] = useState(null);
  const [editCaption, setEditCaption] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [editSaving, setEditSaving] = useState(false);

  const fetchImages = async function() {
    try {
      setLoading(true);
      let snap;
      try {
        snap = await getDocs(query(collection(db, `tenants/${TENANT}/gallery`), orderBy('order', 'asc')));
      } catch (_) {
        snap = await getDocs(collection(db, `tenants/${TENANT}/gallery`));
      }
      setImages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(function() { fetchImages(); }, []);

  const openModal = function() {
    setCaption('');
    setLinkUrl('');
    setLinkPreview(false);
    setTab('upload');
    setModal(true);
  };

  const closeModal = function() {
    if (uploading) return;
    setModal(false);
  };

  const saveToFirestore = async function(url, storagePath) {
    const id = 'gallery-' + Date.now();
    await setDoc(doc(db, `tenants/${TENANT}/gallery`, id), {
      id,
      url,
      caption: caption.trim(),
      storagePath: storagePath || null,
      order: images.length,
      createdAt: new Date().toISOString(),
    });
    await fetchImages();
    setSaved(true);
    setTimeout(function() { setSaved(false); }, 3000);
    setModal(false);
  };

  const handleFileUpload = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);

    // animate fake progress so user sees something
    var fakeTimer = setInterval(function() {
      setUploadProgress(function(p) { return p < 85 ? p + 5 : p; });
    }, 300);

    try {
      const id = 'gallery-' + Date.now();
      const storagePath = `tenants/${TENANT}/gallery/${id}_${file.name}`;
      const storageRef = ref(storage, storagePath);

      const snapshot = await uploadBytes(storageRef, file);
      setUploadProgress(100);

      const url = await getDownloadURL(snapshot.ref);
      await saveToFirestore(url, storagePath);
    } catch (err) {
      console.error('Upload error:', err);
      var msg = err.message || String(err);
      if (err.code === 'storage/unauthorized') {
        alert('Upload blocked: Storage rules do not allow writes.\n\nGo to Firebase Console → Storage → Rules and allow authenticated writes.');
      } else if (err.code === 'storage/unknown' || msg.includes('CORS')) {
        alert('Upload failed: CORS error.\n\nGo to Firebase Console → Storage → Rules and make sure the bucket is set up.');
      } else {
        alert('Upload failed: ' + msg);
      }
    } finally {
      clearInterval(fakeTimer);
      setUploading(false);
      setUploadProgress(0);
    }
    e.target.value = '';
  };

  const handleAddLink = async function() {
    const url = linkUrl.trim();
    if (!url || !url.startsWith('http')) { alert('Please enter a valid URL starting with http'); return; }
    setUploading(true);
    try {
      await saveToFirestore(url, null);
    } catch (err) {
      alert('Error saving link.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async function(image) {
    if (!window.confirm('Remove this photo from the gallery?')) return;
    try {
      if (image.storagePath) {
        try { await deleteObject(ref(storage, image.storagePath)); } catch (_) {}
      }
      await deleteDoc(doc(db, `tenants/${TENANT}/gallery`, image.id));
      await fetchImages();
    } catch (err) {
      alert('Error deleting image.');
    }
  };

  const openEdit = function(image) {
    setEditImage(image);
    setEditCaption(image.caption || '');
    setEditOrder(image.order || 0);
    setEditModal(true);
  };

  const handleEditSave = async function() {
    if (!editImage) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, `tenants/${TENANT}/gallery`, editImage.id), {
        caption: editCaption.trim(),
        order: Number(editOrder),
      });
      await fetchImages();
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 3000);
      setEditModal(false);
    } catch (err) {
      alert('Error saving changes.');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', marginBottom: '4px' }}>Gallery</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {images.length} photo{images.length !== 1 ? 's' : ''} · Updates live on the website instantly
          </p>
        </div>
        <button
          onClick={openModal}
          style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '1px' }}
        >
          + Add Photo
        </button>
      </div>

      {saved && (
        <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>
          ✅ Photo added — live on the website now
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: '20px' }}>Loading gallery...</div>
      ) : images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🖼️</div>
          <div style={{ fontSize: '0.9rem' }}>No photos yet. Hit Add Photo to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          {images.map(function(img) {
            return (
              <div key={img.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div
                  onClick={function() { setLightbox(img.url); }}
                  style={{ aspectRatio: '1', overflow: 'hidden', cursor: 'zoom-in', background: '#0a0a0a' }}
                >
                  <img
                    src={img.url}
                    alt={img.caption || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s' }}
                    onMouseOver={function(e) { e.target.style.transform = 'scale(1.05)'; }}
                    onMouseOut={function(e) { e.target.style.transform = 'scale(1)'; }}
                  />
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.caption || 'No caption'}
                  </span>
                  <button
                    onClick={function() { handleDelete(img); }}
                    style={{ padding: '5px 9px', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '6px', color: '#ff5252', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD PHOTO MODAL */}
      {modal && (
        <div
          onClick={closeModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
        >
          <div
            onClick={function(e) { e.stopPropagation(); }}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '460px' }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.1rem', color: '#d4af37', fontWeight: '700' }}>Add Photo</h2>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px' }}>
              {[['upload', '📁 Upload File'], ['link', '🔗 Add by Link']].map(function(t) {
                return (
                  <button
                    key={t[0]}
                    onClick={function() { setTab(t[0]); setLinkPreview(false); }}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600',
                      background: tab === t[0] ? 'rgba(212,175,55,0.15)' : 'transparent',
                      color: tab === t[0] ? '#d4af37' : 'var(--muted)',
                    }}
                  >
                    {t[1]}
                  </button>
                );
              })}
            </div>

            {/* Caption — shared between both tabs */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Caption (optional)</label>
              <input
                value={caption}
                onChange={function(e) { setCaption(e.target.value); }}
                placeholder="e.g. Skin Fade by Alex"
                style={inputStyle}
              />
            </div>

            {/* UPLOAD TAB */}
            {tab === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '10px', padding: '32px 20px', border: '2px dashed rgba(212,175,55,0.3)',
                  borderRadius: '12px', cursor: uploading ? 'not-allowed' : 'pointer',
                  background: 'rgba(212,175,55,0.04)', transition: 'all 0.2s',
                }}>
                  <span style={{ fontSize: '2rem' }}>{uploading ? '⏳' : '📷'}</span>
                  <span style={{ color: uploading ? 'var(--muted)' : '#d4af37', fontSize: '0.88rem', fontWeight: '700' }}>
                    {uploading ? `Uploading... ${uploadProgress}%` : 'Click to select a photo'}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>JPG, PNG, WEBP — any size</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
                </label>

                {uploading && (
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '99px',
                      background: 'linear-gradient(90deg, #d4af37, #b8860b)',
                      width: uploadProgress + '%',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                )}
              </div>
            )}

            {/* LINK TAB */}
            {tab === 'link' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Photo URL</label>
                  <input
                    value={linkUrl}
                    onChange={function(e) { setLinkUrl(e.target.value); setLinkPreview(false); }}
                    placeholder="https://example.com/photo.jpg"
                    style={inputStyle}
                  />
                </div>

                {linkUrl.trim().startsWith('http') && (
                  <div>
                    <label style={labelStyle}>Preview</label>
                    <div style={{ borderRadius: '10px', overflow: 'hidden', background: '#0a0a0a', border: '1px solid var(--border)', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {linkPreview === false ? (
                        <button
                          onClick={function() { setLinkPreview(true); }}
                          style={{ background: 'transparent', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}
                        >
                          Load preview
                        </button>
                      ) : (
                        <img
                          src={linkUrl.trim()}
                          alt="preview"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onError={function(e) { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                        />
                      )}
                      <span style={{ display: 'none', color: '#ff5252', fontSize: '0.8rem', padding: '12px' }}>Could not load image — check the URL</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleAddLink}
                  disabled={uploading || !linkUrl.trim().startsWith('http')}
                  style={{
                    padding: '13px', background: 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px',
                    color: '#000', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.88rem',
                    opacity: (!linkUrl.trim().startsWith('http') || uploading) ? 0.5 : 1,
                  }}
                >
                  {uploading ? 'Saving...' : 'Add to Gallery'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div
          onClick={function() { setLightbox(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}
        >
          <button onClick={function() { setLightbox(null); }} style={{ position: 'absolute', top: '16px', right: '20px', background: 'transparent', border: 'none', color: '#d4af37', fontSize: '2rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
          <img
            src={lightbox}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.3)', objectFit: 'contain' }}
            onClick={function(e) { e.stopPropagation(); }}
          />
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '11px 14px', background: 'var(--card2, #1a1a1a)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };
