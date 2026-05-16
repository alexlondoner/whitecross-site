import React, { useRef, useCallback } from 'react';

export default function ResizeHandle({ onResize, direction = 'horizontal' }) {
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const handleMouseDown = useCallback((e) => {
    isDragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = (direction === 'horizontal' ? e.clientX : e.clientY) - startPos.current;
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
      onResize(delta);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, direction]);
  return (
    <div onMouseDown={handleMouseDown}
      style={{ width:direction==='horizontal'?'6px':'100%', height:direction==='horizontal'?'100%':'6px', background:'transparent', cursor:direction==='horizontal'?'col-resize':'row-resize', flexShrink:0, position:'relative', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center' }}
      onMouseEnter={e=>e.currentTarget.querySelector('.handle-line').style.background='rgba(212,175,55,0.6)'}
      onMouseLeave={e=>e.currentTarget.querySelector('.handle-line').style.background='rgba(212,175,55,0.15)'}>
      <div className="handle-line" style={{ width:direction==='horizontal'?'2px':'40px', height:direction==='horizontal'?'40px':'2px', background:'rgba(212,175,55,0.15)', borderRadius:'2px', transition:'background 0.2s' }} />
    </div>
  );
}
