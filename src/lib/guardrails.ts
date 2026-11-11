// Input checks shared by the AI routes (quiz generator, LKY Archives).

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// 9+ digits, allowing separators: phone, national ID (NIK), SSN, card numbers.
const LONG_NUMBER = /(?:\d[\s().-]*){9,}/;

/** Catches obvious contact/ID data without spending a model call on it. */
export function containsPersonalData(text: string): boolean {
  return EMAIL.test(text) || LONG_NUMBER.test(text);
}
