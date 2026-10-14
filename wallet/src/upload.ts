export function uploadBytes(value: string) {
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Use a PNG or JPG artwork file.');
  const payload = value.split(',')[1]!;
  if (payload.length > 1_398_104) throw new Error('Artwork is limited to 1 MB.');
  const decoded = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
  if (!decoded.length || decoded.length > 1_048_576) throw new Error('Artwork is limited to 1 MB.');
  const png = [137,80,78,71,13,10,26,10].every((byte, i) => decoded[i] === byte);
  const jpg = decoded[0] === 255 && decoded[1] === 216 && decoded[2] === 255;
  if ((value.startsWith('data:image/png;') && !png) || (value.startsWith('data:image/jpeg;') && !jpg)) throw new Error('Artwork bytes do not match PNG/JPG format.');
  return payload;
}
