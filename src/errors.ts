export class CommandError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = CommandError.name;
  }
}

export class InternalError extends Error {
  public readonly cause: Error;

  constructor(cause: Error, msg: string) {
    super();
    this.name = InternalError.name;
    this.message = `${msg}: ${cause.message}`;
    this.cause = cause;
    this.stack = this.stack.split('\n').slice(0, 2).join('\n') + '\n' + cause.stack;
  }
}
