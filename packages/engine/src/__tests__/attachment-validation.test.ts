/**
 * Engine validation tests for Attachment-typed properties.
 */

import { describe, it, expect } from 'vitest';
import { parseOdl } from '@altius/odl';
import { validateSchemaFields } from '../objects/validation.js';

const SCHEMA = `
extend schema @namespace(name: "test.attachment.engine", version: "0.1.0")

type Document @objectType {
  id: ID! @primary
  title: String!
  file: Attachment
  attachments: [Attachment!]
}
`;

describe('Attachment validation', () => {
  const schema = parseOdl(SCHEMA);

  it('accepts a valid AttachmentRef', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-1',
      title: 'Report',
      file: {
        blobId: 'blob-001',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        size: 1024,
        uploadedAt: '2026-08-17T10:00:00Z',
        uploadedBy: 'user-1',
      },
    });
    expect(failures).toHaveLength(0);
  });

  it('accepts null for optional Attachment', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-2',
      title: 'No file',
      file: null,
    });
    expect(failures).toHaveLength(0);
  });

  it('accepts a list of AttachmentRefs', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-3',
      title: 'Multi',
      attachments: [
        {
          blobId: 'blob-a',
          filename: 'a.pdf',
          contentType: 'application/pdf',
          size: 100,
          uploadedAt: '2026-08-17T10:00:00Z',
        },
        {
          blobId: 'blob-b',
          filename: 'b.png',
          contentType: 'image/png',
          size: 200,
          uploadedAt: '2026-08-17T10:01:00Z',
        },
      ],
    });
    expect(failures).toHaveLength(0);
  });

  it('rejects a non-object value for Attachment', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-4',
      title: 'Bad',
      file: 'not-a-ref',
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it('rejects an AttachmentRef missing blobId', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-5',
      title: 'Bad',
      file: {
        filename: 'report.pdf',
        contentType: 'application/pdf',
        size: 1024,
      },
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it('rejects an AttachmentRef with negative size', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-6',
      title: 'Bad',
      file: {
        blobId: 'blob-x',
        filename: 'bad.bin',
        contentType: 'application/octet-stream',
        size: -1,
        uploadedAt: '2026-08-17T10:00:00Z',
      },
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it('rejects an AttachmentRef with non-string blobId', () => {
    const failures = validateSchemaFields(schema, 'Document', {
      id: 'doc-7',
      title: 'Bad',
      file: {
        blobId: 123,
        filename: 'bad.bin',
        contentType: 'application/octet-stream',
        size: 100,
      },
    });
    expect(failures.length).toBeGreaterThan(0);
  });
});
