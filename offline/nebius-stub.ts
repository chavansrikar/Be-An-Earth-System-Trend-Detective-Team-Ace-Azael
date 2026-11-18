// Offline preview stub: the browser build only needs the error class from api/_nebius.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
