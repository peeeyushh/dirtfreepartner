/**
 * Uploads a file to Cloudinary using an unsigned upload preset.
 * Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env
 */
export async function uploadToCloudinary(
  uri: string,
  folder: string = "service_verification"
): Promise<string> {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      `Cloudinary config missing. CloudName: ${cloudName ? 'OK' : 'MISSING'}, Preset: ${uploadPreset ? 'OK' : 'MISSING'}`
    );
  }

  const formData = new FormData();
  
  const filename = uri.split('/').pop();
  const match = /\.(\w+)$/.exec(filename || '');
  const type = match ? `image/${match[1]}` : `image`;

  formData.append("file", {
    uri,
    name: filename,
    type,
  } as any);
  
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { 
      method: "POST", 
      body: formData,
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || "Cloudinary upload failed");
  }

  return data.secure_url as string;
}
