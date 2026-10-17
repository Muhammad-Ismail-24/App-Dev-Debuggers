const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// "Rs 4,500" (whole rupees) or "Rs 4,500.50". Input is integer paisa.
export function formatPkr(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  const whole = Math.trunc(abs / 100);
  const paisa = abs % 100;
  return `${sign}Rs ${group(whole)}${paisa ? `.${String(paisa).padStart(2, '0')}` : ''}`;
}

// Always two decimals, for receipts: "PKR 4,500.00".
export function formatPkrExact(minor: number): string {
  const abs = Math.abs(Math.round(minor));
  return `${minor < 0 ? '-' : ''}PKR ${group(Math.trunc(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
}
