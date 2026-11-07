#!/bin/sh

# Install Codecov Uploader
# See https://docs.codecov.com/docs/codecov-uploader#using-the-uploader-with-codecovio-cloud

CODECOV_URL="https://uploader.codecov.io"

curl "${CODECOV_URL}/verification.gpg" | gpg --no-default-keyring --keyring trustedkeys.gpg --import
curl -Os "${CODECOV_URL}/latest/linux/codecov"
curl -Os "${CODECOV_URL}/latest/linux/codecov.SHA256SUM"
curl -Os "${CODECOV_URL}/latest/linux/codecov.SHA256SUM.sig"

gpgv codecov.SHA256SUM.sig codecov.SHA256SUM
shasum -a 256 -c codecov.SHA256SUM

chmod +x codecov
