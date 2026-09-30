import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hexToHsv, hsvToHex } from './lib/drawingColors';

export default function EditorColorPicker({ open, anchorRef, value, onChange, onClose }) {
  const [visible,setVisible]=useState(open);
  const [closing,setClosing]=useState(false);
  const [hue,setHue]=useState(hexToHsv(value).h);
  const [hex,setHex]=useState(value);
  const dialogRef=useRef(null);
  const [position,setPosition]=useState({left:8,top:8});
  useEffect(()=>{ setHex(value); const hsv=hexToHsv(value); if(hsv.s) setHue(hsv.h); },[value]);
  useEffect(()=>{
    if(open){setVisible(true);setClosing(false);return;}
    onClose();
    setClosing(true);
    const timer=setTimeout(()=>setVisible(false),260);
    return ()=>clearTimeout(timer);
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const escape=e=>{if(e.key==='Escape'){e.stopImmediatePropagation();onClose();}};
    const outside=e=>{if(!dialogRef.current?.contains(e.target)&&!anchorRef.current?.contains(e.target)&&!e.target.closest('.selected-color-preview'))onClose();};
    window.addEventListener('keydown',escape,true);
    window.addEventListener('pointerdown',outside,true);
    return ()=>{window.removeEventListener('keydown',escape,true);window.removeEventListener('pointerdown',outside,true);};
  },[open,onClose,anchorRef]);
  useLayoutEffect(()=>{
    if(!visible)return;
    const place=()=>{
      const anchor=anchorRef.current?.getBoundingClientRect();
      const dialog=dialogRef.current;
      if(!anchor||!dialog)return;
      setPosition({left:Math.max(8,Math.min(anchor.right-dialog.offsetWidth,window.innerWidth-dialog.offsetWidth-8)),top:Math.max(8,anchor.top-dialog.offsetHeight-8)});
    };
    place();
    window.addEventListener('resize',place);
    window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[visible,anchorRef]);
  if(!visible)return null;
  const hsv=hexToHsv(value);
  const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const move=e=>{
    const rect=e.currentTarget.getBoundingClientRect();
    onChange(hsvToHex(hue,Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))));
  };
  return createPortal(
    <div ref={dialogRef} style={position} className={`editor-color-dialog editor-color-popover${closing?' is-closing':''}`} role="dialog" aria-labelledby="editor-color-title">
      <div className="modal-header"><h2 id="editor-color-title">Выбрать цвет</h2><button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">×</button></div>
      <div className="editor-color-plane" style={{backgroundColor:`hsl(${hue} 100% 50%)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={e=>{if(e.buttons===1)move(e);}}>
        <i style={{left:`${hsv.s*100}%`,top:`${(1-hsv.v)*100}%`}} />
      </div>
      <label className="editor-hue-label">Оттенок<input aria-label="Оттенок" type="range" min="0" max="359" value={hue} onChange={e=>{const h=Number(e.target.value);setHue(h);onChange(hsvToHex(h,hsv.s,hsv.v));}} /></label>
      <div className="editor-rgb-fields">{['R','G','B'].map((channel,index)=><label key={channel}>{channel}<input type="number" min="0" max="255" value={rgb[index]} onChange={e=>{const next=[...rgb];next[index]=Math.max(0,Math.min(255,Math.round(Number(e.target.value)||0)));onChange('#'+next.map(n=>n.toString(16).padStart(2,'0')).join(''));}} /></label>)}</div>
      <label className="editor-hex-field">HEX<input value={hex} maxLength="7" onChange={e=>{setHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))onChange(e.target.value.toLowerCase());}} onBlur={()=>setHex(value)} /></label>
      <div className="history-actions"><button type="button" className="feature-primary" autoFocus onClick={onClose}>Готово</button></div>
    </div>
  ,document.body);
}
