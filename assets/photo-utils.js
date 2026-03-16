/**
 * photo-utils.js - Lightweight image preparation for localStorage-backed capture
 */

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Unable to read selected image'));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unable to process selected image'));
        image.src = dataUrl;
    });
}

export async function preparePhotoForStorage(file, options = {}) {
    if (!file) return null;

    const {
        maxDimension = 1280,
        quality = 0.72,
        mimeType = 'image/jpeg'
    } = options;

    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');

    let { width, height } = image;
    const largestSide = Math.max(width, height);

    if (largestSide > maxDimension) {
        const scale = maxDimension / largestSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        return {
            dataUrl,
            name: file.name,
            type: file.type || mimeType,
            size: file.size
        };
    }

    context.drawImage(image, 0, 0, width, height);

    return {
        dataUrl: canvas.toDataURL(mimeType, quality),
        name: file.name,
        type: mimeType,
        size: file.size
    };
}