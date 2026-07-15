import sys
from PIL import Image

def remove_white_bg(input_path, output_path, tolerance=220):
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()
        
        newData = []
        for item in datas:
            # item is (R, G, B, A)
            if item[0] >= tolerance and item[1] >= tolerance and item[2] >= tolerance:
                newData.append((255, 255, 255, 0)) # Transparent
            else:
                newData.append(item)
                
        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Success: {input_path}")
    except Exception as e:
        print(f"Failed: {input_path} - {e}")

if __name__ == "__main__":
    remove_white_bg(sys.argv[1], sys.argv[1], 230)
