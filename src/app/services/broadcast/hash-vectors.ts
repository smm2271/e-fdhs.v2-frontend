// Shared golden vectors: identical to backend/tests/fixtures/hash_vectors.json.
export const HASH_GOLDEN_VECTORS = [
  {
    name: 'empty',
    value: ['broadcast-sync-v1', 'replies', '00000000-0000-0000-0000-000000000001', []],
    canonical: '["broadcast-sync-v1","replies","00000000-0000-0000-0000-000000000001",[]]',
    sha256: 'sha256:8bc8db119b21ea4a3ee2185b2704f95567d6704626d8a0851bf9cedf20267e1c',
  },
  {
    name: 'unicode',
    value: [
      'broadcast-sync-v1',
      'replies',
      '00000000-0000-0000-0000-000000000001',
      [
        [
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000004',
          '00000000-0000-0000-0000-000000000005',
          '\u8cc7\u8a0a\u80a1\u9577 \ud83d\udce2',
          '\u73ed\u4ee3\u8868',
          'Line 1\n"quote"\\slash\t\b\u0001\u2028\u2029',
          null,
          '2026-10-07T07:00:00.123456Z',
        ],
      ],
    ],
    canonical:
      '["broadcast-sync-v1","replies","00000000-0000-0000-0000-000000000001",[["00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000004","00000000-0000-0000-0000-000000000005","\u8cc7\u8a0a\u80a1\u9577 \ud83d\udce2","\u73ed\u4ee3\u8868","Line 1\\n\\"quote\\"\\\\slash\\t\\b\\u0001\u2028\u2029",null,"2026-10-07T07:00:00.123456Z"]]]',
    sha256: 'sha256:e019339a62b6ffc5f1a5a66b79cd5c8cbb0270f6ff591ddd86d691a3dc10fb51',
  },
  {
    name: 'normalization-preserved',
    value: ['NFC \u00e9', 'NFD e\u0301', false, true, null, []],
    canonical: '["NFC \u00e9","NFD e\u0301",false,true,null,[]]',
    sha256: 'sha256:f5f93938fd6354bee2949199a2521f46843fdecba88c1dc530730261c8bb18ba',
  },
  {
    name: 'broadcast',
    value: [
      'broadcast-sync-v1',
      'broadcasts',
      '00000000-0000-0000-0000-000000000001',
      [
        [
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000005',
          'Teacher',
          'Message',
          '2026-10-07T07:00:00.000000Z',
          '2026-10-08T08:30:00.000000Z',
          [['00000000-0000-0000-0000-000000000004', '201', true, false]],
        ],
      ],
    ],
    canonical:
      '["broadcast-sync-v1","broadcasts","00000000-0000-0000-0000-000000000001",[["00000000-0000-0000-0000-000000000002","00000000-0000-0000-0000-000000000005","Teacher","Message","2026-10-07T07:00:00.000000Z","2026-10-08T08:30:00.000000Z",[["00000000-0000-0000-0000-000000000004","201",true,false]]]]]',
    sha256: 'sha256:0f5b66e6e0e49a9d3a50686487bc2a6f7b531a1c0339bc1529253410cc5fe810',
  },
];
