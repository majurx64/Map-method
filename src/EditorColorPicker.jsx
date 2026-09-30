import { useEffect, useState } from 'react';
import { hexToHsv, hsvToHex } from './lib/drawingColors';

export default function EditorColorPicker({ open, value, onChange, onPick, onClose }) {
  const [visible,setVisible]=useState(open);
  const [closing,setClosing]=useState(false);
  const [hue,setHue]=useState(hexToHsv(value).h);
  const [hex,setHex]=useState(value);
  const [sampling,setSampling]=useState(false);
  const [pickMessage,setPickMessage]=useState('');
  useEffect(()=>{ setHex(value); const hsv=hexToHsv(value); if(hsv.s) setHue(hsv.h); },[value]);
  useEffect(()=>{
    if(open){setVisible(true);setClosing(false);setPickMessage('');return;}
    setClosing(true);
    const timer=setTimeout(()=>setVisible(false),260);
    return ()=>clearTimeout(timer);
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const escape=e=>{if(e.key==='Escape'&&!sampling){e.stopImmediatePropagation();onClose();}};
    window.addEventListener('keydown',escape,true);
    return ()=>window.removeEventListener('keydown',escape,true);
  },[open,onClose,sampling]);
  if(!visible)return null;
  const hsv=hexToHsv(value);
  const rgb=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const move=e=>{
    const rect=e.currentTarget.getBoundingClientRect();
    onChange(hsvToHex(hue,Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))));
  };
  return <div className={`modal-overlay feature-modal-overlay${closing?' is-closing':''}`} onMouseDown={onClose}>
    <div className="create-modal editor-color-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-color-title" onMouseDown={e=>e.stopPropagation()}>
      <div className="modal-header"><h2 id="editor-color-title">Выбрать цвет</h2><button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">×</button></div>
      <div className="editor-color-plane" style={{backgroundColor:`hsl(${hue} 100% 50%)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={e=>{if(e.buttons===1)move(e);}}>
        <i style={{left:`${hsv.s*100}%`,top:`${(1-hsv.v)*100}%`}} />
      </div>
      <label className="editor-hue-label">Оттенок<input aria-label="Оттенок" type="range" min="0" max="359" value={hue} onChange={e=>{const h=Number(e.target.value);setHue(h);onChange(hsvToHex(h,hsv.s,hsv.v));}} /></label>
      <div className="editor-rgb-fields">{['R','G','B'].map((channel,index)=><label key={channel}>{channel}<input type="number" min="0" max="255" value={rgb[index]} onChange={e=>{const next=[...rgb];next[index]=Math.max(0,Math.min(255,Math.round(Number(e.target.value)||0)));onChange('#'+next.map(n=>n.toString(16).padStart(2,'0')).join(''));}} /></label>)}</div>
      <label className="editor-hex-field">HEX<input value={hex} maxLength="7" onChange={e=>{setHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))onChange(e.target.value.toLowerCase());}} onBlur={()=>setHex(value)} /></label>
      <div className="history-actions">{typeof window.EyeDropper==='function'&&<span className="editor-eyedropper">
        <button type="button" disabled={sampling} aria-describedby="editor-eyedropper-help" onClick={async()=>{
          setPickMessage('');
          setSampling(true);
          try {
            const picked=await new window.EyeDropper().open();
            onPick(picked.sRGBHex);
            setPickMessage('Цвет добавлен в палитру и выбран для кисти.');
          } catch(error) {
            if(error.name!=='AbortError')setPickMessage('Не удалось выбрать цвет. Попробуйте ещё раз.');
          } finally {setSampling(false);}
        }}>Пипетка</button>
        <span className="editor-eyedropper-help" role="tooltip" id="editor-eyedropper-help">Нажмите «Пипетка», затем выберите цвет на экране левой кнопкой мыши. Esc — отмена. Браузер не поддерживает выбор правой кнопкой.</span>
      </span>}<button type="button" className="feature-primary" autoFocus onClick={onClose}>Готово</button></div>
      <p className="editor-pick-message" role="status">{pickMessage}</p>
    </div>
  </div>;
}
