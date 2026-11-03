export class DomainValidationError extends Error {
  constructor(
    public readonly field: string,
    message = '입력값을 확인해 주세요.',
  ) {
    super(message)
    this.name = 'DomainValidationError'
  }
}
