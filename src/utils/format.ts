export function strooopsToXLM(stroops: bigint | string): string {
  const n = typeof stroops === 'string' ? BigInt(stroops) : stroops;
  const xlm = Number(n) / 10_000_000;
  return xlm.toFixed(7).replace(/\.?0+$/, '');
}

export function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ''] = xlm.split('.');
  const padded = frac.padEnd(7, '0').slice(0, 7);
  return BigInt(whole + padded);
}

export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}
