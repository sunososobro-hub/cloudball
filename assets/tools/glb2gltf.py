"""glb → 內嵌 base64 的 .gltf.json（artifact 不能放 .glb）。用法：python3 glb2gltf.py in.glb out.gltf.json"""
import sys, json, struct, base64
b = open(sys.argv[1], 'rb').read()
jl = struct.unpack_from('<I', b, 12)[0]
js = json.loads(b[20:20 + jl])
bl = struct.unpack_from('<I', b, 20 + jl)[0]
binc = b[28 + jl:28 + jl + bl]
js['buffers'] = [{'byteLength': len(binc), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode()}]
open(sys.argv[2], 'w').write(json.dumps(js, separators=(',', ':')))
