// Extracts the photo, disparity map and Portrait Effects Matte from an iPhone
// Portrait-mode HEIC. Used by iphone_portrait.py; run on macOS:
//   swift tools/depth/iphone_extract.swift <photo.heic> <out-dir>
import Foundation
import ImageIO
import AVFoundation
import CoreImage
import UniformTypeIdentifiers

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let outDir = URL(fileURLWithPath: CommandLine.arguments[2])
guard let src = CGImageSourceCreateWithURL(input as CFURL, nil) else { fatalError("open") }

func writePNG(_ img: CGImage, _ name: String) {
  let url = outDir.appendingPathComponent(name)
  let dst = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, img, nil)
  CGImageDestinationFinalize(dst)
  print("wrote", name, img.width, "x", img.height)
}

// Photo (orientation applied, converted to sRGB)
let ctx = CIContext()
let photo = CIImage(contentsOf: input, options: [.applyOrientationProperty: true])!
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
writePNG(ctx.createCGImage(photo, from: photo.extent, format: .RGBA8, colorSpace: srgb)!, "photo.png")

// Disparity → Float32, written as 16-bit grayscale normalized to its min/max (range printed).
let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any]
let orientation = CGImagePropertyOrientation(rawValue: (props?[kCGImagePropertyOrientation as String] as? UInt32) ?? 1) ?? .up
print("orientation", orientation.rawValue)
let info = CGImageSourceCopyAuxiliaryDataInfoAtIndex(src, 0, kCGImageAuxiliaryDataTypeDisparity) as! [AnyHashable: Any]
var depth = try! AVDepthData(fromDictionaryRepresentation: info)
depth = depth.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat32).applyingExifOrientation(orientation)
let pb = depth.depthDataMap
CVPixelBufferLockBaseAddress(pb, .readOnly)
let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), rb = CVPixelBufferGetBytesPerRow(pb)
let base = CVPixelBufferGetBaseAddress(pb)!
var vals = [Float](repeating: 0, count: w * h)
for y in 0..<h {
  let row = base.advanced(by: y * rb).assumingMemoryBound(to: Float32.self)
  for x in 0..<w { vals[y * w + x] = row[x].isFinite ? row[x] : 0 }
}
CVPixelBufferUnlockBaseAddress(pb, .readOnly)
let lo = vals.min()!, hi = vals.max()!
print("disparity range", lo, hi)
// Raw float dump for precise processing in Python.
let data = vals.withUnsafeBufferPointer { Data(buffer: $0) }
try! data.write(to: outDir.appendingPathComponent("disparity_\(w)x\(h).f32"))
print("wrote disparity", w, "x", h)

// Portrait effects matte (soft person mask)
let minfo = CGImageSourceCopyAuxiliaryDataInfoAtIndex(src, 0, kCGImageAuxiliaryDataTypePortraitEffectsMatte) as! [AnyHashable: Any]
let matte = try! AVPortraitEffectsMatte(fromDictionaryRepresentation: minfo).applyingExifOrientation(orientation)
let mimg = CIImage(cvPixelBuffer: matte.mattingImage)
writePNG(ctx.createCGImage(mimg, from: mimg.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())!, "matte.png")
