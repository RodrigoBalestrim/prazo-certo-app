/** Conversões de imagem usadas antes de upload e análise por IA. */
import * as ImageManipulator from "expo-image-manipulator";

const MAX_DIMENSION = 1024;
const COMPRESS_QUALITY = 0.6;

// Reduz o tamanho da imagem (máx. 1024 px, JPEG 60%) antes de enviar.
// Evita corpos de requisição gigantes (erro/timeout) e acelera a IA.
export async function compressImageForUpload(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (result.base64) {
      return `data:image/jpeg;base64,${result.base64}`;
    }
  } catch {
    // Mantém a imagem original se a compressão falhar.
  }
  return uri;
}
