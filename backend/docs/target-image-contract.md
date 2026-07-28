# Target Image API Contract

## Summary

Target responses include an optional `imageUrl` field.

Target images are stored in the MinIO `assets` bucket.

## Response Field

```json
{
  "id": "TGT-001",
  "operationAreaId": "AREA-001",
  "type": "VEHICLE",
  "status": "ACTIVE",
  "imageUrl": "/api/targets/TGT-001/image/download?objectKey=targets%2FTGT-001%2Fuuid.png"
}
```

If no image is registered, `imageUrl` is `null`.

## Upload

```text
POST /api/targets/{targetId}/image
Content-Type: multipart/form-data
```

```bash
curl -X POST http://localhost:8000/api/targets/TGT-001/image \
  -F "file=@target.png"
```

Allowed extensions:

```text
.png, .jpg, .jpeg, .svg
```

Response:

```json
{
  "success": true,
  "data": {
    "target": {
      "id": "TGT-001",
      "imageUrl": "/api/targets/TGT-001/image/download?objectKey=targets%2FTGT-001%2Fuuid.png"
    },
    "image": {
      "objectKey": "targets/TGT-001/uuid.png",
      "url": "/api/targets/TGT-001/image/download?objectKey=targets%2FTGT-001%2Fuuid.png"
    }
  },
  "message": "표적 이미지가 업로드되었습니다."
}
```

## Download

```text
GET /api/targets/{targetId}/image/download?objectKey={objectKey}
```

The frontend should use `target.imageUrl` directly.

## Delete

```text
DELETE /api/targets/{targetId}/image
```

The response returns the target with `imageUrl: null`.

## WebSocket Events

```text
target.image.updated
target.image.deleted
```

The existing event envelope is unchanged.
