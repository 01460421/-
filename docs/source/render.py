"""Render every page of a PDF to PNG for visual inspection."""
import sys
import pypdfium2 as pdfium

pdf_path = sys.argv[1]
prefix = sys.argv[2] if len(sys.argv) > 2 else "page"
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.3

pdf = pdfium.PdfDocument(pdf_path)
print("pages:", len(pdf))
for i, page in enumerate(pdf):
    img = page.render(scale=scale).to_pil()
    out = f"{prefix}-{i+1:02d}.png"
    img.save(out)
    print("saved", out, img.size)
