// The local identity only selects an account-scoped offline copy. Every server
// request still goes through Supabase's session validation and access rules.
export function cachedAccountUser(auth, storage, href) {
  try {
    const url = new URL(href);
    if (url.searchParams.has('code') || /access_token=|refresh_token=/.test(url.hash)) return null;
    if (!auth.storageKey) return null;
    const session = JSON.parse(storage.getItem(auth.storageKey) || 'null');
    if (typeof session?.user?.id !== 'string' || !session.user.id || !session.access_token || !session.refresh_token) return null;
    return session.user;
  } catch { return null; }
}

export function syncFailureMessage(error, { hasLocalCopy = true } = {}) {
  const message = String(error?.message || '').toLowerCase();
  if (error?.code === 'MM_SYNC_CONFLICT') return 'Есть разные версии карты. Ваши правки сохранены на устройстве. Откройте «Версии и копии» и выберите нужную.';
  if (error?.status === 402 || message.includes('quota') || message.includes('payment required')) return 'Сервер ограничил доступ из-за лимита.' + (hasLocalCopy ? ' Карты и правки сохранены на устройстве.' : '');
  if (error?.status === 401 || error?.code === 'PGRST301' || message.includes('jwt expired')) return 'Нужно снова войти в аккаунт для синхронизации.' + (hasLocalCopy ? ' Карты и правки сохранены на устройстве.' : '');
  if (!hasLocalCopy) return 'Пока не удалось загрузить карты с сервера. Повторите загрузку.';
  return 'Пока не удалось синхронизировать карты. Открыта сохранённая копия; правки сохраняются на устройстве.';
}
