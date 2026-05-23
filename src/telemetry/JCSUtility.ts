export class JCSUtility {
  public static canonicalize(obj: unknown): string {
    if (obj === null) return 'null';

    if (typeof obj === 'undefined' || typeof obj === 'function' || typeof obj === 'symbol') {
      throw new TypeError('JCS does not support undefined, functions, or symbols.');
    }

    if (typeof obj !== 'object') {
      if (typeof obj === 'number') {
        if (!Number.isFinite(obj)) throw new TypeError('JCS requires finite numbers.');
        if (Object.is(obj, -0)) return '0';

        const str = obj.toString();
        return str.includes('e') || str.includes('E') ? JSON.stringify(obj) : str;
      }

      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return `[${obj.map((item) => JCSUtility.canonicalize(item)).join(',')}]`;
    }

    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a.charCodeAt(i) !== b.charCodeAt(i)) return a.charCodeAt(i) - b.charCodeAt(i);
      }
      return a.length - b.length;
    });
    const members = sortedKeys.map((key) => `${JSON.stringify(key)}:${JCSUtility.canonicalize(record[key])}`);

    return `{${members.join(',')}}`;
  }
}
