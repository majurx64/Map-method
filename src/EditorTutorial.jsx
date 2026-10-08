import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './EditorTutorial.css';

export const EDITOR_TUTORIAL_STEPS = [
  { target: '.grid-viewport', mode: true, title: 'Каждая клетка — один шаг', text: 'Это ваша демо-карта. Нажмите на клетку рисунка, чтобы отметить выполненный шаг. Повторное нажатие убирает отметку. На компьютере можно вести мышью с зажатой кнопкой; правая кнопка стирает.' },
  { target: '.game-fill-control', mode: true, title: 'Несколько шагов сразу', text: 'Откройте «Заполнить клетки», укажите количество и выберите «По порядку» или «Хаотично». Клетки появятся постепенно, а процент будет расти вместе с ними. «Отменить» возвращает предыдущий результат.' },
  { target: '.map-mode-switch', mode: false, title: 'Рисование и игра', text: 'В «Рисовании» создаётся сам эскиз: добавляйте и стирайте клетки. В «Игре» отмечайте прогресс по этому эскизу. Попробуйте добавить пару клеток — размер цели изменится вместе с рисунком.' },
  { target: '.palette-section', mode: false, title: 'Цвета и свои оттенки', text: 'Выберите цвет кисти в палитре справа и попробуйте его на демо-карте. Можно добавить свой оттенок через кнопку выбора цвета. Новые цвета сохраняются в вашей палитре.' },
  { target: '[data-tutorial="selection"]', mode: false, title: 'Перемещение рисунка', text: 'Нажмите «Выделение», обведите нужные клетки и перетащите выделенную область. На компьютере область также можно выделить с Ctrl.' },
  { target: '[data-tutorial="undo"]', mode: false, title: 'Можно передумать', text: '«Отменить» возвращает предыдущий штрих или перемещение, «Повторить» применяет его снова. На компьютере работают Ctrl+Z и Ctrl+Y. Попробуйте обе кнопки на демо-карте.' },
  { target: '.cells-stepper', mode: false, title: 'Размер поля', text: '«Авто» подбирает сетку по количеству клеток. «Вручную» позволяет менять строки и столбцы, выбирая, с какой стороны их добавлять. Масштаб меняется кнопками над полем, а на компьютере — Ctrl и колёсиком мыши.' },
  { target: '.tool-type', mode: false, title: 'Карта из изображения', text: 'Нажмите «Изображение» слева и загрузите картинку. Она превратится в цветную сетку: размер поля определяет детализацию. Кнопка «Кисть» позволяет вернуться к свободному рисунку.' },
  { target: '.save-map-btn', title: 'Карта сохраняется', text: 'В аккаунте изменения сохраняются автоматически. Кнопка «Сохранить» помогает убедиться, что всё записано; «Скачать» создаёт изображение карты. Если вы ещё не вошли, войдите или зарегистрируйтесь, чтобы хранить свои карты в аккаунте.' },
  { target: '.header-back-links', title: 'История и совместные карты', text: 'В «Моих картах» есть история версий, восстановление прежних этапов и кнопка «Поделиться». Совместную карту можно вести с другими участниками и смотреть вклад каждого.' },
  { target: '.account-trigger, .account-login-btn', title: 'Загляните в личный кабинет', text: 'Там много интересного: календарь активности, статистика прогресса, серии активных дней и достижения. Обучение можно снова открыть кнопкой «Как это работает». Демо-карту можно оставить, изменить или удалить.' },
];

export default function EditorTutorial({ step, busy, onStep, onClose, onAccount }) {
  const [closing, setClosing] = useState(false);
  const cardRef = useRef(null);
  const highlightRef = useRef(null);
  const contentRef = useRef(null);
  const motionRef = useRef(null);
  const item = EDITOR_TUTORIAL_STEPS[step];
  useLayoutEffect(() => {
    let frame = 0, target, lastTime = 0;
    let scrolled = false;
    const until = performance.now() + 650;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const observer = new ResizeObserver(schedule);
    if (contentRef.current) observer.observe(contentRef.current);
    let aim = null;
    const measure = () => {
      const found = target?.isConnected && !target.closest('[inert]') ? target : [...document.querySelectorAll(item.target)].find((node) => !node.closest('[inert]') && node.getBoundingClientRect().height > 0);
      if (found && found !== target) {
        if (target) observer.unobserve(target);
        target = found;
        observer.observe(target);
      }
      if (target) {
        const rect = target.getBoundingClientRect();
        if (!scrolled && (rect.top < 8 || rect.bottom > window.innerHeight - 8)) {
          scrolled = true;
          target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
        }
        const width = Math.min(360, window.innerWidth - 24);
        const style = getComputedStyle(cardRef.current);
        const height = Math.min(window.innerHeight - 24, (contentRef.current?.offsetHeight || 228) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2);
        const right = rect.right + 20;
        const left = right + width < window.innerWidth - 12 ? right : rect.left - width - 20 > 12 ? rect.left - width - 20 : Math.max(12, (window.innerWidth - width) / 2);
        const top = rect.bottom + height + 20 < window.innerHeight ? rect.bottom + 16 : Math.max(12, Math.min(rect.top - height - 16, window.innerHeight - height - 12));
        aim = { x: rect.left - 5, y: rect.top - 5, width: rect.width + 10, height: rect.height + 10, left, top, cardHeight: height };
      }
    };
    function animate(now) {
      frame = 0;
      measure();
      if (!aim) { if (now < until) frame = requestAnimationFrame(animate); return; }
      const current = motionRef.current ||= { ...aim };
      const factor = reduced ? 1 : 1 - Math.exp(-Math.min(32, lastTime ? now - lastTime : 16) / 75);
      lastTime = now;
      let moving = false;
      for (const key of Object.keys(aim)) {
        const delta = aim[key] - current[key];
        current[key] = Math.abs(delta) < .15 ? aim[key] : current[key] + delta * factor;
        if (Math.abs(aim[key] - current[key]) >= .15) moving = true;
      }
      const card = cardRef.current, highlight = highlightRef.current;
      card.style.transform = `translate3d(${current.left}px,${current.top}px,0)`;
      card.style.height = `${current.cardHeight}px`;
      card.dataset.ready = 'true';
      highlight.style.transform = `translate3d(${current.x}px,${current.y}px,0)`;
      highlight.style.width = `${current.width}px`; highlight.style.height = `${current.height}px`;
      highlight.dataset.ready = 'true';
      if (moving || now < until) frame = requestAnimationFrame(animate);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(animate); }
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
  }, [item]);
  useLayoutEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, 220);
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  return createPortal(<div className={`editor-tour${closing ? ' is-closing' : ''}`}>
    <div ref={highlightRef} className="editor-tour-highlight" />
    <section ref={cardRef} className="editor-tour-card" role="dialog" aria-labelledby="editor-tour-title"><div ref={contentRef}>
      <div className="editor-tour-heading"><span>ПОПРОБУЙТЕ НА ДЕМО-КАРТЕ · {step + 1} / {EDITOR_TUTORIAL_STEPS.length}</span><button type="button" aria-label="Закрыть обучение" onClick={() => setClosing(true)}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" /></svg></button></div>
      <div className="editor-tour-dots" aria-hidden="true">{EDITOR_TUTORIAL_STEPS.map((_, index) => <i key={index} className={index <= step ? 'active' : ''} />)}</div>
      <div key={step} className="editor-tour-content" aria-live="polite"><h2 id="editor-tour-title">{item.title}</h2><p>{item.text}</p><small>Можно пробовать инструменты прямо сейчас.</small></div>
      <div className="editor-tour-actions"><button type="button" disabled={!step || closing || busy} onClick={() => onStep(step - 1)}>Назад</button><button type="button" className="editor-tour-next" disabled={closing || busy} onClick={() => step < EDITOR_TUTORIAL_STEPS.length - 1 ? onStep(step + 1) : setClosing(true)}>{step < EDITOR_TUTORIAL_STEPS.length - 1 ? 'Дальше' : 'Готово'}</button></div>
      {step === EDITOR_TUTORIAL_STEPS.length - 1 && <button type="button" className="editor-tour-account" onClick={onAccount}>Открыть личный кабинет →</button>}
    </div></section>
  </div>, document.body);
}
