const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export function formatDate(date: string | null): string {
  if (!date) return 'Дата неизвестна';
  const [y, m, d] = date.split('-');
  return d ? `${Number(d)} ${months[Number(m) - 1]} ${y}` : m ? `${monthNames[Number(m) - 1]} ${y}` : y;
}
export function dateBounds(date: string) {
  const [y, m, d] = date.split('-');
  return { min: `${y}${m ?? '01'}${d ?? '01'}`, max: `${y}${m ?? '12'}${d ?? '31'}` };
}
export function compareDates(a: string | null, b: string | null) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return dateBounds(a).min.localeCompare(dateBounds(b).min);
}
