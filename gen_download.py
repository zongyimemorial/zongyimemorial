import base64

pdf_path = "/workspace/宗忆堂-陆苗苗-大鹏新区OPC百企培育计划申请资料.pdf"
out_path = "/workspace/opc-download.html"

with open(pdf_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

fname = "宗忆堂-陆苗苗-大鹏新区OPC百企培育计划申请资料.pdf"
data_url = f"data:application/pdf;base64,{b64}"

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>申请资料下载</title>
<style>
  body {{ font-family: "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;
         margin:0; background:#f5f1e8; color:#2a2620; }}
  .wrap {{ max-width:760px; margin:40px auto; background:#fff; padding:36px 40px;
          border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,.08); }}
  h1 {{ color:#403010; font-size:20px; margin:0 0 6px; }}
  .sub {{ color:#8a5a20; font-size:13px; margin-bottom:24px; }}
  .btn {{ display:inline-block; background:#403010; color:#f0e3c0; text-decoration:none;
         padding:14px 28px; border-radius:8px; font-size:16px; font-weight:700;
         border:2px solid #d8b878; }}
  .btn:hover {{ background:#5e352a; }}
  .tip {{ margin-top:22px; font-size:13px; color:#6b6456; line-height:1.9;
         background:#fbf6ea; border-left:4px solid #d8b878; padding:12px 16px; }}
  embed {{ width:100%; height:70vh; border:1px solid #ddd; border-radius:6px; margin-top:20px; }}
</style>
</head>
<body>
<div class="wrap">
  <h1>宗忆堂 · 大鹏新区 OPC 百企培育计划申请资料</h1>
  <div class="sub">文件大小约 800KB ｜ 共 16 页 ｜ 文件名：{fname}</div>
  <a class="btn" href="{data_url}" download="{fname}">⬇ 点击下载 PDF（保存到 D 盘）</a>
  <div class="tip">
    <b>保存到 D 盘步骤：</b><br>
    1. 点击上方按钮，浏览器会下载该 PDF；<br>
    2. 在下载提示中选择「另存为」或直接拖入 <b>D:\\</b> 文件夹；<br>
    3. 若浏览器自动存到“下载”目录，可将其剪切 / 复制到 D 盘。<br>
    <i>提示：若按钮无反应，可右键按钮 → “链接另存为”。</i>
  </div>
  <embed src="{data_url}" type="application/pdf">
</div>
</body>
</html>
"""

with open(out_path, "w") as f:
    f.write(html)

print("written:", out_path, "bytes:", len(html))
