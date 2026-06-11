import UIKit
import CoreImage

/// Fabric-safe glass surface that keeps React children as direct subviews.
///
/// Public UIKit has no CALayer equivalent of `UIVisualEffectView` backdrop blur.
/// This view therefore renders a blurred snapshot of the content behind itself into
/// private layers. React Native children remain direct Fabric-managed subviews, so
/// Yoga layout, touch handling, and Fabric unmount index checks keep working.
public final class GlassSurfaceView: UIView {

  public var variant: String = "floating" {
    didSet { updateAppearance() }
  }

  public var cornerRadius: CGFloat = 16 {
    didSet { updateGeometry() }
  }

  public var tintColorOverride: UIColor? {
    didSet { updateAppearance() }
  }

  public var interactive: Bool = false {
    didSet { updateRefreshLoop() }
  }

  public var fallbackOpacity: CGFloat = 0.85 {
    didSet { updateAppearance() }
  }

  public var reduceTransparencyFallbackColor: UIColor = UIColor.white.withAlphaComponent(0.85) {
    didSet { updateAppearance() }
  }

  private let backdropLayer = CALayer()
  private let materialLayer = CALayer()
  private let highlightLayer = CAGradientLayer()
  private let borderLayer = CAShapeLayer()
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  private var displayLink: CADisplayLink?
  private var needsBackdropRefresh = true
  private var lastRefreshTime: CFTimeInterval = 0

  override public var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: UIView.noIntrinsicMetric)
  }

  override public init(frame: CGRect) {
    super.init(frame: frame)
    setupView()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    displayLink?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }

  private func setupView() {
    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = false
    isUserInteractionEnabled = true
    layer.cornerCurve = .continuous
    layer.masksToBounds = true

    backdropLayer.contentsGravity = .resizeAspectFill
    backdropLayer.masksToBounds = true
    backdropLayer.zPosition = -4

    materialLayer.masksToBounds = true
    materialLayer.zPosition = -3

    highlightLayer.startPoint = CGPoint(x: 0.1, y: 0.0)
    highlightLayer.endPoint = CGPoint(x: 0.9, y: 1.0)
    highlightLayer.zPosition = -2

    borderLayer.fillColor = UIColor.clear.cgColor
    borderLayer.lineWidth = 1.0 / UIScreen.main.scale
    borderLayer.zPosition = -1

    // These are layers, not subviews. Fabric only tracks `subviews`, so React
    // children stay at the exact indices Fabric mounted them at.
    layer.addSublayer(backdropLayer)
    layer.addSublayer(materialLayer)
    layer.addSublayer(highlightLayer)
    layer.addSublayer(borderLayer)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleReduceTransparencyStatusDidChange(_:)),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )

    updateGeometry()
    updateAppearance()
  }

  // MARK: - Layout

  override public func layoutSubviews() {
    super.layoutSubviews()
    updateGeometry()
    setNeedsBackdropRefresh()
  }

  override public func didMoveToWindow() {
    super.didMoveToWindow()
    updateRefreshLoop()
    setNeedsBackdropRefresh()
  }

  override public func didMoveToSuperview() {
    super.didMoveToSuperview()
    setNeedsBackdropRefresh()
  }

  // MARK: - Updates

  private func updateGeometry() {
    CATransaction.begin()
    CATransaction.setDisableActions(true)

    layer.cornerRadius = cornerRadius
    backdropLayer.frame = bounds
    backdropLayer.cornerRadius = cornerRadius
    materialLayer.frame = bounds
    materialLayer.cornerRadius = cornerRadius
    highlightLayer.frame = bounds
    highlightLayer.cornerRadius = cornerRadius

    let inset = borderLayer.lineWidth / 2
    let borderRect = bounds.insetBy(dx: inset, dy: inset)
    borderLayer.path = UIBezierPath(
      roundedRect: borderRect,
      cornerRadius: max(0, cornerRadius - inset)
    ).cgPath

    CATransaction.commit()
  }

  private func updateAppearance() {
    CATransaction.begin()
    CATransaction.setDisableActions(true)

    if UIAccessibility.isReduceTransparencyEnabled {
      backdropLayer.contents = nil
      materialLayer.backgroundColor = reduceTransparencyFallbackColor.cgColor
      materialLayer.opacity = 1
      highlightLayer.colors = []
      borderLayer.strokeColor = UIColor.white.withAlphaComponent(0.35).cgColor
      CATransaction.commit()
      return
    }

    let tint = resolvedTintColor() ?? UIColor.white.withAlphaComponent(variantTintIntensity())
    let materialAlpha = materialOpacity()

    materialLayer.backgroundColor = tint.withAlphaComponent(materialAlpha).cgColor
    materialLayer.opacity = Float(max(0, min(1, fallbackOpacity)))
    highlightLayer.colors = [
      UIColor.white.withAlphaComponent(highlightOpacity()).cgColor,
      UIColor.white.withAlphaComponent(0.04).cgColor,
      UIColor.black.withAlphaComponent(0.03).cgColor
    ]
    highlightLayer.locations = [0.0, 0.48, 1.0]
    borderLayer.strokeColor = UIColor.white.withAlphaComponent(borderOpacity()).cgColor

    CATransaction.commit()
    setNeedsBackdropRefresh()
  }

  private func setNeedsBackdropRefresh() {
    needsBackdropRefresh = true
    DispatchQueue.main.async { [weak self] in
      self?.refreshBackdropIfNeeded(force: false)
    }
  }

  private func updateRefreshLoop() {
    displayLink?.invalidate()
    displayLink = nil

    guard window != nil, interactive, !UIAccessibility.isReduceTransparencyEnabled else {
      return
    }

    let link = CADisplayLink(target: self, selector: #selector(handleDisplayLink(_:)))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 6, maximum: 12, preferred: 10)
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  @objc private func handleDisplayLink(_ link: CADisplayLink) {
    guard link.timestamp - lastRefreshTime >= 0.08 else { return }
    refreshBackdropIfNeeded(force: true)
  }

  private func refreshBackdropIfNeeded(force: Bool) {
    guard force || needsBackdropRefresh else { return }
    guard window != nil, bounds.width > 1, bounds.height > 1 else { return }
    guard !UIAccessibility.isReduceTransparencyEnabled else { return }

    needsBackdropRefresh = false
    lastRefreshTime = CACurrentMediaTime()

    guard let blurredImage = makeBlurredBackdropImage() else { return }

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    backdropLayer.contents = blurredImage.cgImage
    backdropLayer.contentsScale = blurredImage.scale
    CATransaction.commit()
  }

  private func makeBlurredBackdropImage() -> UIImage? {
    guard let superview else { return nil }

    let rectInSuperview = convert(bounds, to: superview)
    guard rectInSuperview.width > 1, rectInSuperview.height > 1 else { return nil }

    let renderScale = min(UIScreen.main.scale, 1.5)
    let format = UIGraphicsImageRendererFormat()
    format.scale = renderScale
    format.opaque = false

    let renderer = UIGraphicsImageRenderer(size: bounds.size, format: format)

    let snapshot = renderer.image { context in
      context.cgContext.translateBy(x: -rectInSuperview.minX, y: -rectInSuperview.minY)

      // Temporarily hide this host so the snapshot contains only what is behind
      // the glass, not the previous blurred image or React children.
      let wasHidden = isHidden
      isHidden = true
      defer { isHidden = wasHidden }
      superview.drawHierarchy(in: superview.bounds, afterScreenUpdates: true)
    }

    return blur(image: snapshot, radius: blurRadius())
  }

  private func blur(image: UIImage, radius: CGFloat) -> UIImage? {
    guard let inputImage = CIImage(image: image) else { return image }

    let clamped = inputImage.clampedToExtent()
    guard let filter = CIFilter(name: "CIGaussianBlur") else { return image }
    filter.setValue(clamped, forKey: kCIInputImageKey)
    filter.setValue(radius, forKey: kCIInputRadiusKey)

    guard let outputImage = filter.outputImage?.cropped(to: inputImage.extent) else {
      return image
    }

    guard let cgImage = ciContext.createCGImage(outputImage, from: inputImage.extent) else {
      return image
    }

    return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
  }

  @objc private func handleReduceTransparencyStatusDidChange(_ notification: Notification) {
    updateAppearance()
    updateRefreshLoop()
  }

  private func resolvedTintColor() -> UIColor? {
    let intensity = variantTintIntensity()

    guard let tintColorOverride else {
      return UIColor.white.withAlphaComponent(intensity)
    }

    return tintColorOverride.withAlphaComponent(max(0.08, min(1.0, intensity)))
  }

  private func variantTintIntensity() -> CGFloat {
    switch variant.lowercased() {
    case "floating": return 0.16
    case "control": return 0.22
    case "sheet": return 0.28
    case "search": return 0.34
    case "modal": return 0.42
    case "status": return 0.12
    default: return 0.16
    }
  }

  private func materialOpacity() -> CGFloat {
    switch variant.lowercased() {
    case "floating": return 0.30
    case "control": return 0.36
    case "sheet": return 0.42
    case "search": return 0.46
    case "modal": return 0.54
    case "status": return 0.24
    default: return 0.30
    }
  }

  private func highlightOpacity() -> CGFloat {
    switch variant.lowercased() {
    case "floating": return 0.30
    case "control": return 0.26
    case "sheet": return 0.24
    case "search": return 0.22
    case "modal": return 0.20
    case "status": return 0.18
    default: return 0.30
    }
  }

  private func borderOpacity() -> CGFloat {
    switch variant.lowercased() {
    case "floating": return 0.42
    case "control": return 0.36
    case "sheet": return 0.32
    case "search": return 0.30
    case "modal": return 0.28
    case "status": return 0.24
    default: return 0.42
    }
  }

  private func blurRadius() -> CGFloat {
    switch variant.lowercased() {
    case "floating": return 18
    case "control": return 14
    case "sheet": return 24
    case "search": return 20
    case "modal": return 30
    case "status": return 12
    default: return 18
    }
  }
}
