export interface BankLinje { date: string; vdate?: string; amount: number; text: string; ref: string; balance?: number | null }
export interface Kontoutskrift { kind: 'csv' | 'camt'; account: string; opening: number | null; closing: number | null; closingDate: string; from: string; to: string; lines: BankLinje[] }
export function parseBank(text: string): Kontoutskrift;
export function decodeFile(buf: Uint8Array | ArrayBuffer, kind: 'csv' | 'bank' | 'xml'): string;
export function parseEhf(xml: string): Record<string, unknown>;
export function parseInvoiceText(text: string): Record<string, unknown>;
export const CONTROLS: { id: string; area: string; t: string; d: string; rule: string; th: string }[];
