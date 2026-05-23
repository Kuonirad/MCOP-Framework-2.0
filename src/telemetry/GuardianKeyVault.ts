import * as crypto from 'node:crypto';

export class GuardianKeyVault {
  private readonly privateKeyObject: crypto.KeyObject;
  public readonly publicKeyHex: string;

  private constructor(privateKey: crypto.KeyObject, publicKey: Buffer) {
    this.privateKeyObject = privateKey;
    this.publicKeyHex = publicKey.toString('hex');
  }

  public static fromRootSeed(rootSeed: Buffer): GuardianKeyVault {
    const prk = Buffer.from(
      crypto.hkdfSync('sha256', rootSeed, Buffer.alloc(0), Buffer.from('MCOP_GUARDIAN_SALT'), 32),
    );
    const privateScalar = Buffer.from(
      crypto.hkdfSync('sha256', prk, Buffer.alloc(0), Buffer.from('MCOP_GUARDIAN_ED25519_V1'), 32),
    );
    const pkcs8Header = Buffer.from([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22,
      0x04, 0x20,
    ]);
    const completePkcs8 = Buffer.concat([pkcs8Header, privateScalar]);
    const privateKey = crypto.createPrivateKey({ key: completePkcs8, format: 'der', type: 'pkcs8' });
    const publicKeyObject = crypto.createPublicKey(privateKey);
    const spkiBuffer = publicKeyObject.export({ format: 'der', type: 'spki' });
    const rawPublicKey = Buffer.from(spkiBuffer).subarray(spkiBuffer.byteLength - 32);

    return new GuardianKeyVault(privateKey, rawPublicKey);
  }

  public signHash(messageHashHex: string): string {
    return crypto.sign(null, Buffer.from(messageHashHex, 'hex'), this.privateKeyObject).toString('hex');
  }
}
