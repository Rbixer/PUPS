/** Clave temporal legible, de 9 caracteres, distinta a la de demostración. */
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const body = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
  return `Pups-${body}`
}
