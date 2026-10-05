import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './EditorTutorial.css';

export const EDITOR_TUTORIAL_STEPS = [
  { target: '.grid-viewport', mode: true, title: 'Каждая клетка — один шаг', text: 'Это ваша демо-карта. Нажмите на клетку рисунка, чтобы отметить выполненный шаг. Повторное нажатие убирает отметку. На компьютере можно вести мышью с зажатой кнопкой; правая кнопка стирает.' },
  { target: '.game-fill-control', mode: true, title: 'Несколько шагов сразу', text: 'Откройте «Заполнить клетки», укажите количество и выберите «По порядку» или «Хаотично». Клетки появятся постепенно, а процент будет расти вместе с ними. «Отменить» возвращает предыдущий результат.' },
  { target: '.map-mode-switch', mode: false, title: 'Рисование и игра', text: 'В «Рисовании» создаётся сам эскиз: добавляйте и стирайте клетки. В «Игре» отмечайте прогресс по этому эскизу. Попробуйте добавить пару клеток — размер цели изменится вместе с рисунком.' },
  { target: '.palette-section', mode: false, title: 'Цвета и свои оттенки', text: 'Выберите цвет кисти в палитре справа. Можно добавить свой оттенок. Кнопка «Изображение» слева позволяет вместо кисти загрузить картинку и превратить её в карту.' },
  { target: '[data-tutorial="selection"]', mode: false, title: 'Перемещение рисунка', text: 'Нажмите «Выделение», обведите нужные клетки и перетащите выделенную область. Следующее нажатие в любом месте только закрывает выделение и не меняет клетки. На компьютере область также можно выделить с Ctrl.' },
  { target: '[data-tutorial="undo"]', mode: false, title: 'Можно передумать', text: '«Отменить» возвращает предыдущий штрих или перемещение, «Повторить» применяет его снова. На компьютере работают Ctrl+Z и Ctrl+Y. Попробуйте обе кнопки на демо-карте.' },
  { target: '.cells-stepper', mode: false, title: 'Размер поля', text: '«Авто» подбирает сетку по количеству клеток. «Вручную» позволяет менять строки и столбцы, выбирая, с какой стороны их добавлять. Масштаб меняется кнопками над полем, а на компьютере — Ctrl и колёсиком мыши.' },
  { target: '.save-map-btn', title: 'Карта сохраняется', text: 'В аккаунте изменения сохраняются автоматически. Кнопка «Сохранить» помогает убедиться, что всё записано; «Скачать» создаёт изображение карты. Если вы ещё не вошли, войдите или зарегистрируйтесь, чтобы хранить свои карты в аккаунте.' },
  { target: '.header-back-links', title: 'История и совместные карты', text: 'В «Моих картах» есть история версий, восстановление прежних этапов и кнопка «Поделиться». Совместную карту можно вести с другими участниками и смотреть вклад каждого.' },
  { target: '.account-trigger, .account-login-btn', title: 'Загляните в личный кабинет', text: 'Там много интересного: календарь активности, статистика прогресса, серии активных дней и достижения. Обучение можно снова открыть кнопкой «Как это работает». Демо-карту можно оставить, изменить или удалить.' },
];

export default function EditorTutorial({ step, busy, onStep, onClose, onAccount }) {
  const [position, setPosition] = useState(null);
  const [closing, setClosing] = useState(false);
  const cardRef = useRef(null);
  const item = EDITOR_TUTORIAL_STEPS[step];
  useLayoutEffect(() => {
    let frame = 0, observer, target;
    let scrolled = false;
    const until = performance.now() + 650;
    const measure = () => {
      const found = [...document.querySelectorAll(item.target)].find((node) => !node.closest('[inert]') && node.getBoundingClientRect().height > 0);
      if (found && found !== target) {
        target = found;
        observer?.disconnect();
        observer = new ResizeObserver(schedule);
        observer.observe(target);
      }
      if (target) {
        const rect = target.getBoundingClientRect();
        if (!scrolled && (rect.top < 8 || rect.bottom > window.innerHeight - 8)) {
          scrolled = true;
          target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
        }
        const width = Math.min(360, window.innerWidth - 24);
        const height = cardRef.current?.offsetHeight || 270;
        const right = rect.right + 20;
        const left = right + width < window.innerWidth - 12 ? right : rect.left - width - 20 > 12 ? rect.left - width - 20 : Math.max(12, (window.innerWidth - width) / 2);
        const top = rect.bottom + height + 20 < window.innerHeight ? rect.bottom + 16 : Math.max(12, Math.min(rect.top - height - 16, window.innerHeight - height - 12));
        const next = { x: rect.left, y: rect.top, width: rect.width, height: rect.height, left, top };
        setPosition((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      }
      if (performance.now() < until) frame = requestAnimationFrame(measure);
    };
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }
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
    {position && <div className="editor-tour-highlight" style={{ left: position.x - 5, top: position.y - 5, width: position.width + 10, height: position.height + 10 }} />}
    <section ref={cardRef} className="editor-tour-card" role="dialog" aria-labelledby="editor-tour-title" style={position ? { left: position.left, top: position.top } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
      <div className="editor-tour-heading"><span>ПОПРОБУЙТЕ НА ДЕМО-КАРТЕ · {step + 1} / {EDITOR_TUTORIAL_STEPS.length}</span><button type="button" aria-label="Закрыть обучение" onClick={() => setClosing(true)}>×</button></div>
      <div className="editor-tour-dots" aria-hidden="true">{EDITOR_TUTORIAL_STEPS.map((_, index) => <i key={index} className={index <= step ? 'active' : ''} />)}</div>
      <div key={step} className="editor-tour-content" aria-live="polite"><h2 id="editor-tour-title">{item.title}</h2><p>{item.text}</p><small>Можно пробовать инструменты прямо сейчас.</small></div>
      <div className="editor-tour-actions"><button type="button" disabled={!step || closing || busy} onClick={() => onStep(step - 1)}>Назад</button><button type="button" className="editor-tour-next" disabled={closing || busy} onClick={() => step < EDITOR_TUTORIAL_STEPS.length - 1 ? onStep(step + 1) : setClosing(true)}>{step < EDITOR_TUTORIAL_STEPS.length - 1 ? 'Дальше' : 'Готово'}</button></div>
      {step === EDITOR_TUTORIAL_STEPS.length - 1 && <button type="button" className="editor-tour-account" onClick={onAccount}>Открыть личный кабинет →</button>}
    </section>
  </div>, document.body);
}
