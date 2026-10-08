import { useEffect, useRef, useState } from 'react';
import { portableBackup } from './lib/deviceBackupSchedule';
import { parseBackup } from './lib/productFeatures';
import { BackupDisclosure, BackupFrequency } from './BackupControls';

const dateTime = (at) => new Date(at).toLocaleString('ru-RU');
const installer = 'https://github.com/majurx64/Map-method/releases/download/v1.0.5/Map-Method-Setup.exe';
export default function DesktopBackupPanel({ owner, health, onRestore, device, capture }) {
  const api = window.mapMethodDesktop?.backups;
  const { settings, supported, native, configure, allowFolder } = device;
  const [entries, setEntries] = useState([]);
  const [archiveFolder, setArchiveFolder] = useState('');
  const [id, setId] = useState('');
  const [mapId, setMapId] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    if (!api || !archiveOpen) return;
    let alive = true;
    Promise.allSettled([api.list(owner), api.info()]).then(([copies, info]) => {
      if (!alive) return;
      if (info.status === 'fulfilled') setArchiveFolder(info.value.path);
      if (copies.status === 'fulfilled') setEntries(copies.value);
      else setNotice('Не удалось прочитать защищённые копии. Проверьте профиль Windows и папку приложения.');
    });
    return () => { alive = false; };
  }, [api, owner, archiveOpen, health.revision]);
  const selected = entries.find((entry) => entry.id === id) || entries[0];
  const selectedMap = selected?.maps.some((map) => map.id === mapId) ? mapId : '';
  const locked = busy || device.busy;
  async function act(operation, file) {
    if (locked) return;
    setBusy(true); setNotice('');
    try {
      if (operation === 'download') {
        const snapshot = await capture(false);
        if (!snapshot || snapshot.owner !== owner) throw new Error('Дождитесь загрузки карт и завершения рисования.');
        const text = portableBackup(snapshot);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        link.download = `map-method-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setNotice('Файл передан браузеру для сохранения. Проверьте папку «Загрузки» или выбранное место.');
      } else if (operation === 'import') {
        if (file.size > 50 * 1024 * 1024) throw new Error('Файл больше 50 МБ. Выберите копию поменьше.');
        const text = await file.text(), maps = parseBackup(text);
        await onRestore(maps, JSON.parse(text).profile?.preferences);
        setNotice(`Восстановлено отдельными копиями: ${maps.length}. Дождитесь подтверждения синхронизации.`);
      } else if (operation === 'device-folder') await api.openBackupFolder(owner);
      else if (operation === 'archive-folder') await api.openFolder();
      else if (!selected) throw new Error('Дождитесь первой защищённой копии.');
      else if (operation === 'export') {
        const result = await api.export(owner, selected.id, selectedMap);
        if (!result.canceled) setNotice(`Сохранён файл ${result.name}.`);
      } else {
        const snapshot = await api.read(owner, selected.id);
        const restored = snapshot.maps.filter((map) => !selectedMap || map.id === selectedMap);
        await onRestore(restored, snapshot.preferences);
        setNotice(`Восстановлено отдельными копиями: ${restored.length}. Дождитесь подтверждения синхронизации.`);
      }
    } catch (error) {
      setNotice(error.message === 'export-too-large' ? 'Резервная копия не создана: один файл ограничен 50 МБ и 1000 картами. Изображения и история тоже входят в размер. Ваши карты и предыдущие копии сохранены.'
        : operation === 'import' ? 'Не удалось восстановить весь файл. Проверьте формат. Уже добавленные копии сохранены; при повторе они могут продублироваться.'
          : ['download', 'restore'].includes(operation) ? error.message || 'Копия недоступна.' : 'Не удалось открыть или сохранить файл. Проверьте папку и свободное место.');
    } finally { setBusy(false); }
  }
  return <section className="backup-archive device-backups" id="backup-archive">
    <div><span className="account-eyebrow">РЕЗЕРВНЫЕ КОПИИ</span><h2>Копии на это устройство</h2><p>Отдельный файл поможет вернуть карты после ошибки, очистки данных сайта или потери доступа к аккаунту. Карты по-прежнему синхронизируются через сервер; резервные файлы место на Supabase не занимают.</p></div>
    {supported ? <div className="device-backup-options">
      <label className="animated-setting-toggle device-backup-toggle"><input type="checkbox" checked={settings.enabled} disabled={locked || settings.loading} onChange={(event) => configure({ enabled: event.target.checked, intervalDays: settings.intervalDays }, event.target.checked && !settings.folder)} /><span className="setting-switch" aria-hidden="true"><i /></span><span><strong>Сохранять файлы автоматически</strong><small>Только на этом устройстве и для этого аккаунта</small></span></label>
      <BackupFrequency value={settings.intervalDays} disabled={locked || settings.loading} onChange={(intervalDays) => configure({ enabled: settings.enabled, intervalDays })} />
      <div className="device-backup-destination"><p className="desktop-backup-path">{settings.folder ? `Папка: ${settings.folder}` : 'Выберите папку для файлов резервных копий.'}</p><div className="backup-conflict-actions"><button type="button" disabled={locked || settings.loading} onClick={() => configure({ enabled: true, intervalDays: settings.intervalDays }, true)}>{settings.folder ? 'Изменить папку' : 'Выбрать папку и включить'}</button>{native && settings.folder && <button type="button" disabled={locked} onClick={() => act('device-folder')}>Открыть папку</button>}{settings.needsPermission && <button type="button" className="feature-primary" disabled={locked} onClick={allowFolder}>Разрешить запись</button>}</div></div>
      <p className="device-backup-last" role="status">{settings.lastAt ? `Последний автоматический файл: ${dateTime(settings.lastAt)}.` : settings.enabled ? 'Первый файл появится после загрузки карт и завершения текущего действия.' : 'Автоматическое сохранение файлов выключено.'}</p>
    </div> : <p className="device-backup-availability">{window.mapMethodDesktop?.isDesktop ? 'Для выбора папки и частоты обновите Windows-приложение до 1.0.5.' : 'Автоматическая запись в выбранную папку доступна в Chrome/Edge на компьютере и в Windows-приложении 1.0.5. В этом браузере можно скачать копию вручную.'}{/Windows NT/.test(navigator.userAgent) && <> <a href={installer}>Скачать приложение для Windows</a></>}</p>}
    <p className="backup-retention-note">После включения копий достаточно открыть сайт или приложение и дождаться загрузки карт — файл сохранится в выбранную папку, когда наступит выбранный срок. Если несколько дней не заходили, при следующем открытии сохранится одна свежая копия. При закрытом сайте и приложении файлы не создаются.</p>
    <div className="backup-conflict-actions"><button type="button" className="feature-primary" disabled={locked} onClick={() => act('download')}>Скачать копию сейчас</button><button type="button" disabled={locked} onClick={() => input.current?.click()}>Восстановить из файла</button></div>
    <input ref={input} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void act('import', file); }} />
    <BackupDisclosure title="Что сохраняется, куда и как восстановить?" open={helpOpen} onToggle={setHelpOpen}>
      <p>Файл JSON содержит загруженные карты, их рисунки, прогресс, сохранённую историю, личные эскизы, местные настройки и текущие правки, включая ещё не отправленные на сервер. Пароли и токены входа не копируются.</p>
      <p>Автоматические файлы находятся в выбранной вами папке. В браузере показываем её название; полный путь можно увидеть в окне выбора папки. Ручное скачивание обычно попадает в «Загрузки», либо браузер предлагает выбрать место.</p>
      <p>Для восстановления войдите в аккаунт, нажмите «Восстановить из файла» и выберите нужный JSON. Карты появятся отдельными копиями, а язык, цвета, категории и последнее число заполнения восстановятся автоматически, если они есть в файле. Действующие карты сохранятся. После подтверждения синхронизации новые копии появятся на телефоне и ПК. Совместная карта восстановится как личная, без старых приглашений.</p>
      <p>Файлы переносимы между компьютерами и содержат данные в открытом виде. Храните их приватно; для защиты от поломки диска выбирайте внешний носитель или папку своего облака. Старые файлы автоматически не удаляем — чистите ненужные даты самостоятельно.</p>
      <p>Выбор папки и частота копирования действуют отдельно на каждом устройстве, в браузере и приложении. Если доступ к папке потерян, файл не сохранится: нажмите «Разрешить запись» или выберите папку заново. Выключение автоматических копий останавливает создание новых файлов; уже сохранённые остаются в папке.</p>
    </BackupDisclosure>
    {api && <BackupDisclosure title="Восстановить из защищённых копий приложения" open={archiveOpen} onToggle={setArchiveOpen}>
      <p>Приложение дополнительно хранит сжатые зашифрованные состояния за 90 дней. Это страховка от ошибок и очистки кэша. Архив привязан к этому профилю Windows; для другого компьютера используйте JSON-файл.</p>
      {archiveFolder && <p className="desktop-backup-path">Папка: {archiveFolder}</p>}
      {selected ? <><div className="backup-filters"><label>Состояние<select value={selected.id} onChange={(event) => { setId(event.target.value); setMapId(''); }} disabled={locked}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{dateTime(entry.at)} · {entry.maps.length} карт</option>)}</select></label><label>Карты<select value={selectedMap} onChange={(event) => setMapId(event.target.value)} disabled={locked}><option value="">Все карты и эскизы</option>{selected.maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label></div><div className="backup-conflict-actions"><button type="button" disabled={locked} onClick={() => act('archive-folder')}>Открыть папку архива</button><button type="button" disabled={locked} onClick={() => act('export')}>Сохранить JSON</button><button type="button" className="feature-primary" disabled={locked} onClick={() => act('restore')}>Восстановить копиями</button></div></> : <p>Первая защищённая копия появится после загрузки карт.</p>}
    </BackupDisclosure>}
    {(settings.error || health.error || notice) && <p className={`feature-status${settings.error || health.error ? ' error' : ''}`} role={settings.error || health.error ? 'alert' : 'status'}>{settings.error || health.error || notice}</p>}
  </section>;
}
