import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  const [salt, key] = hash.split(':');
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}
// Cada día hábil contiene sus 24 horas. Se excluyen los fines de semana
// según la zona de Bolivia (UTC-4), sin horario de verano.
export function deadlineFor(endDate) {
  const date = new Date(`${endDate}T23:59:59-04:00`);
  let remaining = 72;
  while (remaining > 0) {
    date.setTime(date.getTime() + 3600000);
    const day = new Date(date.getTime() - 4 * 3600000).getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return date.toISOString();
}
export function canGrade(endDate, unlockedUntil, now = new Date()) {
  return now <= new Date(deadlineFor(endDate)) || Boolean(unlockedUntil && now <= new Date(unlockedUntil));
}
export function validGrade(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100;
}

export const dimensions = [
  { key: 'saber', label: 'Saber', max: 40 },
  { key: 'hacer', label: 'Hacer', max: 40 },
  { key: 'ser', label: 'Ser', max: 20 },
];

export function dimensionGrades(input) {
  const result = {};
  for (const { key, label, max } of dimensions) {
    const value = input[key];
    if (value === null) { result[key] = null; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
      throw new Error(`${label} debe estar entre 0 y ${max}, con un máximo de dos decimales.`);
    }
    result[key] = value;
  }
  result.grade = dimensions.every(d => result[d.key] !== null)
    ? Math.round(dimensions.reduce((sum, d) => sum + result[d.key], 0) * 100) / 100
    : null;
  if (result.grade !== null && !validGrade(result.grade)) throw new Error('La nota final debe estar entre 1 y 100.');
  return result;
}
