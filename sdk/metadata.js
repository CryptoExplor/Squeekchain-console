/** Decodes a data:application/json;base64,<meta> URI into { name, description, attributes, image }. */
export function parseSqueekMetadata(uri) {
  if (typeof uri !== "string" || !uri.startsWith("data:application/json;base64,")) {
    throw new Error("tokenURI is not base64 JSON");
  }
  if (uri.length > 262144) throw new Error("Metadata exceeds DotGrid URI limit");
  const b64 = uri.split(",")[1];
  const text =
    typeof Buffer !== "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const meta = JSON.parse(text);
  if (!/^data:image\/svg\+xml;base64,/.test(meta.image ?? "")) throw new Error("Unsupported art image URI");
  return {
    name: meta.name,
    description: meta.description,
    image: meta.image, // data:image/svg+xml;base64,… — display as an isolated <img>, never inline
    attributes: (meta.attributes ?? []).map((a) => ({ trait: a.trait_type, value: a.value })),
    properties: meta.properties ?? null,
  };
}

