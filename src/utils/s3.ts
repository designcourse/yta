import { S3Client } from "@aws-sdk/client-s3";

export function getS3Client() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS S3 environment configuration");
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function getBucketName() {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) throw new Error("Missing S3_BUCKET_NAME env var");
  return bucket;
}


