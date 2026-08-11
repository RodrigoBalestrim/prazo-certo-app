// Chave estável para leitura de código de barras.
//
// Produto de peso variável (balança de varejo) imprime EAN-13 que muda a cada
// pesagem: 2|123456|01500|8 -> "2" + código interno (6 dígitos) + peso em
// gramas (5 dígitos) + dígito verificador. A parte fixa é prefixo + código.
export function normalizeBarcode(value: string): string | null {
  const code = value.trim();
  // Code128/QR e afins não numéricos não têm peso variável nem check digit:
  // o valor cru já é a identidade.
  if (!/^\d+$/.test(code)) return code || null;

  let digits = code;
  if (digits.length === 12) digits = `0${digits}`; // UPC-A vira o EAN-13 equivalente (mesmas barras)
  if (digits.length !== 13 && digits.length !== 8) return null;
  if (!validCheckDigit(digits)) return null;

  // Peso variável: prefixo "2" + 6 dígitos do produto. Descarta os 5 dígitos
  // de peso ou preço embutidos.
  if (digits.length === 13 && digits.startsWith("2")) return digits.slice(0, 7);
  if (digits.length === 13 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function validCheckDigit(digits: string): boolean {
  let sum = 0;
  let weight = 3; // dígito logo antes do verificador pesa 3, alternando 1/3
  for (let i = digits.length - 2; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}
