export async function blobSha(content: string) {
  const data = new TextEncoder().encode(content);
  const header = new TextEncoder().encode('blob ' + data.length + '\0');
  const bytes = new Uint8Array(header.length + data.length);
  bytes.set(header); bytes.set(data, header.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
