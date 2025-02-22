import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import * as core from '@actions/core';
import * as openpgp from 'openpgp';
import * as fetch from 'node-fetch';

import {
  getBaseUrl,
  getUploaderName,
  setFailure,
} from './helpers';

const verify = async (filename: string, platform: string) => {
  try {
    const uploaderName = getUploaderName(platform);

    // Read in public key
    const publicKeyArmored = await fs.readFileSync(
        path.join(__dirname, 'pgp_keys.asc'),
        'utf-8',
    );

    // Get SHASUM and SHASUM signature files
    const shasumRes = await fetch( `${getBaseUrl(platform)}.SHA256SUM`);
    const shasum = await shasumRes.text();

    const shaSigRes = await fetch( `${getBaseUrl(platform)}.SHA256SUM.sig`);
    const shaSig = await shaSigRes.text();

    // Verify shasum
    const verified = await openpgp.verify({
      message: await openpgp.createMessage({text: shasum}),
      signature: await openpgp.readSignature({armoredSignature: shaSig}),
      verificationKeys: await openpgp.readKeys({armoredKeys: publicKeyArmored}),
    });
    const valid = await verified.signatures[0].verified;
    if (valid) {
      core.info('==> SHASUM file signed by key id ' +
          verified.signatures[0].keyID.toHex(),
      );
    } else {
      setFailure('Codecov: Error validating SHASUM signature', true);
    }

    const calculateHash = async (filename: string) => {
      const stream = fs.createReadStream(filename);
      const uploaderSha = crypto.createHash(`sha256`);
      stream.pipe(uploaderSha);

      return new Promise((resolve, reject) => {
        stream.on('end', () => resolve(
            `${uploaderSha.digest('hex')}  ${uploaderName}`,
        ));
        stream.on('error', reject);
      });
    };

    const hash = await calculateHash(filename);
    if (hash === shasum) {
      core.info(`==> Uploader SHASUM verified (${hash})`);
    } else {
      setFailure(
          'Codecov: Uploader shasum does not match -- ' +
            `uploader hash: ${hash}, public hash: ${shasum}`,
          true,
      );
    }
  } catch (err) {
    setFailure(`Codecov: Error validating uploader: ${err.message}`, true);
  }
};
export default verify;
