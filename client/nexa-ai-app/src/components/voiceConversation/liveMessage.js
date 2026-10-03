export const parseLiveServerMessage = async data => {
  let json;

  if (typeof data === 'string') {
    json = data;
  } else if (data instanceof Blob) {
    json = await data.text();
  } else if (data instanceof ArrayBuffer) {
    json = new TextDecoder().decode(data);
  } else if (ArrayBuffer.isView(data)) {
    json = new TextDecoder().decode(data);
  } else {
    throw new TypeError('Unsupported Live API message data');
  }

  const message = JSON.parse(json);
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new TypeError('Live API message must be a JSON object');
  }

  return message;
};
