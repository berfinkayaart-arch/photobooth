import os
import json
from PIL import Image
import numpy as np

def extract_slots(filename):
    try:
        img = Image.open(filename).convert('RGBA')
        data = np.array(img)
        alpha = data[:, :, 3]
        
        # Find the bounding box of the opaque frame
        y_opaque, x_opaque = np.where(alpha > 200)
        if len(y_opaque) == 0:
            return {"slots": []}
            
        min_x, max_x = np.min(x_opaque), np.max(x_opaque)
        min_y, max_y = np.min(y_opaque), np.max(y_opaque)
        
        # Instead of just rows, let's find connected components of transparent pixels inside the frame
        # We will look for pixels with alpha < 50
        mask = (alpha < 50).astype(np.uint8)
        
        # Crop mask to the frame
        frame_mask = mask[min_y:max_y+1, min_x:max_x+1]
        
        # Custom BFS for connected components
        h_frame, w_frame = frame_mask.shape
        visited = np.zeros((h_frame, w_frame), dtype=bool)
        slots = []
        
        for r in range(h_frame):
            for c in range(w_frame):
                if frame_mask[r, c] == 1 and not visited[r, c]:
                    # Start BFS
                    queue = [(r, c)]
                    visited[r, c] = True
                    min_r, max_r = r, r
                    min_c, max_c = c, c
                    
                    while queue:
                        curr_r, curr_c = queue.pop(0)
                        for dr, dc in [(-1,0), (1,0), (0,-1), (0,1)]:
                            nr, nc = curr_r + dr, curr_c + dc
                            if 0 <= nr < h_frame and 0 <= nc < w_frame:
                                if frame_mask[nr, nc] == 1 and not visited[nr, nc]:
                                    visited[nr, nc] = True
                                    queue.append((nr, nc))
                                    min_r = min(min_r, nr)
                                    max_r = max(max_r, nr)
                                    min_c = min(min_c, nc)
                                    max_c = max(max_c, nc)
                    
                    w = max_c - min_c + 1
                    h = max_r - min_r + 1
            
                    # Filter out tiny artifacts
                    if w > 100 and h > 100:
                        slots.append({
                            "x": int(min_x + min_c),
                            "y": int(min_y + min_r),
                            "width": int(w),
                            "height": int(h)
                        })
        
        # Sort slots from top to bottom, then left to right
        slots.sort(key=lambda s: (s['y'], s['x']))
        return {"slots": slots}
    except Exception as e:
        print(f"Error processing {filename}: {e}")
        return {"slots": []}

def main():
    template_config = {}
    for i in range(1, 22):
        filename = f"you! ({i}).png"
        if os.path.exists(filename):
            config = extract_slots(filename)
            template_config[filename] = config
    
    with open('template_config.json', 'w') as f:
        json.dump(template_config, f, indent=4)
    print("Done generating template_config.json")

if __name__ == "__main__":
    main()
