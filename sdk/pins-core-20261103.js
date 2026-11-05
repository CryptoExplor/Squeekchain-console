// AUTO-GENERATED from docs/deployments/core-sepolia-20261103.json — do not edit by hand.
// Published identities for core-sepolia-20261103 (revision 7).
// implementation, implementation runtime hash, storage layout digest and ProxyAdmin
// are the published values; the record does not publish proxy runtime hashes or
// implementation code versions, so those pins stay null instead of being guessed.

export const PUBLISHED_PROFILE = {
  "key": "sepolia",
  "label": "Sepolia",
  "short": "sepolia",
  "chainId": 11155111,
  "hexChainId": "0xaa36a7",
  "kind": "deployed",
  "issuanceShape": "schedule",
  "addresses": {
    "core": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
    "issuance": "0x2dccb11fcc2defdd188555e45acb52231e82e218",
    "mining": "0x2dccb11fcc2defdd188555e45acb52231e82e218",
    "staking": "0x50fd1780526c3186a0c037c7622203bc4fb611ca",
    "token": "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
    "nft": "0xc4c7982657f00509548f3a3a41db7fa439a6856b",
    "genesis": "0xc4c7982657f00509548f3a3a41db7fa439a6856b"
  },
  "identities": {
    "release": "core-sepolia-20261103",
    "revision": 7,
    "protocolRevision": "staged-launch-1",
    "deploymentBlock": 12057556,
    "source": "docs/deployments/core-sepolia-20261103.json",
    "capturedAt": null,
    "pins": {
      "core": {
        "address": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
        "runtimeCodeHash": null,
        "implSlot": "0x6869d6102696243fd17013ab955d99cd0c522ad3",
        "adminSlot": "0x21b3cb8f00d0d47b246a57d04152d6e11d24abb3",
        "implCodeHash": "0x65b5780a4fccafedeca1260806364d2bb512b4501c097253f792ae2839565a9c",
        "implementationStorageLayoutDigest": "0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20",
        "wiring": {
          "configuration": {
            "streamId": "0xa78faebd5aad38b4f90c7f61b9c5c10e8d9b9afe74ebfc2e82ca98b7e57ed562",
            "genesisTimestamp": "1793735400",
            "roundDuration": "600",
            "maxWorkPerRound": "10000",
            "guardian": "0xb2826926ef5cffebef86037c27b48ce345ed691f",
            "reporter": "0x71f47c02431e6995cf6f757c14bc6bfa443d0a86"
          }
        }
      },
      "issuance": {
        "address": "0x2dccb11fcc2defdd188555e45acb52231e82e218",
        "runtimeCodeHash": null,
        "implSlot": "0x32639fc0bbd16ba0b140f78950751591609cfaa4",
        "adminSlot": "0xd857f72f7f73bb8b8050c14e923ff4e05f7d75cb",
        "implCodeHash": "0xbcc7179f61610f44cf19a8fe4ffe27c06cba083a9430eb2787c5807b30e1e959",
        "implementationStorageLayoutDigest": "0xd6b3c14eaf89f7fc4406a878b162d146dc32a171907d2571bc7ba1d2d34763a1",
        "wiring": {
          "bindings": {
            "core": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
            "token": "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
            "staking": "0x50fd1780526c3186a0c037c7622203bc4fb611ca",
            "governance": "0xaa2e9621de9ac23cbb36d1a1bac4c8b0694cc30d",
            "streamId": "0xa78faebd5aad38b4f90c7f61b9c5c10e8d9b9afe74ebfc2e82ca98b7e57ed562",
            "genesisTimestamp": "1793735400",
            "minimumTimelockDelay": "300"
          },
          "core": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4"
        }
      },
      "staking": {
        "address": "0x50fd1780526c3186a0c037c7622203bc4fb611ca",
        "runtimeCodeHash": null,
        "implSlot": "0xf7027f9759d98190638359920e0422d316b4ea92",
        "adminSlot": "0x08aa8200b2a5a863b1eb8396914c49f96f325425",
        "implCodeHash": "0xb379b434af414fccf7fbb03105e07a527aba86bec169cdd7afadc640c4104bd1",
        "implementationStorageLayoutDigest": "0xc7d9d27b142e9eea9117d439e8c387fdffa8d777ea2c7ea2668654986b085e45",
        "wiring": {
          "core": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
          "token": "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
          "mining": "0x2dccb11fcc2defdd188555e45acb52231e82e218",
          "governance": "0xaa2e9621de9ac23cbb36d1a1bac4c8b0694cc30d"
        }
      },
      "token": {
        "address": "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
        "runtimeCodeHash": "0x6d6ea1d4143a02637e905d4d923b48f78f81f46aa1169f5004f5a150a2433329",
        "implSlot": "0x0000000000000000000000000000000000000000",
        "adminSlot": "0x0000000000000000000000000000000000000000",
        "implCodeHash": null,
        "implementationStorageLayoutDigest": null,
        "wiring": {
          "mining": "0x2dccb11fcc2defdd188555e45acb52231e82e218",
          "miningBindingAuthority": "0xaa2e9621de9ac23cbb36d1a1bac4c8b0694cc30d"
        }
      },
      "nft": {
        "address": "0xc4c7982657f00509548f3a3a41db7fa439a6856b",
        "runtimeCodeHash": "0xa378da21bde37bb0f4c4f482d3f7c502d59d31551521d64ee297d37aa6d88b8c",
        "implSlot": "0x0000000000000000000000000000000000000000",
        "adminSlot": "0x0000000000000000000000000000000000000000",
        "implCodeHash": null,
        "implementationStorageLayoutDigest": null,
        "wiring": {
          "sqkCore": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
          "governance": "0xaa2e9621de9ac23cbb36d1a1bac4c8b0694cc30d",
          "guardian": "0xb2826926ef5cffebef86037c27b48ce345ed691f",
          "renderer": "0x50888ea2469cc4e619bfcbdc4a7e7d58d4ddd165",
          "art": "0x0677aca34747cd8e60f988f75e2f89d5e00bb27d",
          "protocolRecipient": "0xd5dab9f1d15e9d45548078726c54732a5b59eb78"
        }
      }
    }
  },
  "startBlock": "12057556"
};
