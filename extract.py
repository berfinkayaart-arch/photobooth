from PIL import Image
import numpy as np

img = Image.open('4.png').convert('RGB')
data = np.array(img)

mask = (data[:, :, 0] < 20) & (data[:, :, 1] < 20) & (data[:, :, 2] < 20)
y_dark, x_dark = np.where(mask)

if len(y_dark) > 0:
    print(f"4.png dimensions: {img.size}")
    print(f"Dark rectangle bounds:")
    print(f"X: {np.min(x_dark)} to {np.max(x_dark)}")
    print(f"Y: {np.min(y_dark)} to {np.max(y_dark)}")
else:
    print("No black rectangle found")
