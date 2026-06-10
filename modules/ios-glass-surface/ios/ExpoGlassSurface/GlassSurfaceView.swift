import UIKit

/// A React Native Fabric-compatible glass surface view.
///
/// Subclasses `UIView` (NOT `UIVisualEffectView`) so that React Native Fabric
/// can freely manage child subviews via `mountChildComponentView`.
/// The internal `UIVisualEffectView` lives as a private child at index 0,
/// and React children are mounted into its `contentView` via the overridden
/// Fabric mount methods.
///
/// **CRITICAL**: Never subclass `UIVisualEffectView` as a Fabric host view.
/// UIKit throws `NSInternalInconsistencyException` when `addSubview:` is called
/// directly on a `UIVisualEffectView` — children must go to `contentView`.
/// React Native Fabric calls `addSubview:` via `mountChildComponentView`, which
/// triggers this UIKit assertion and crashes. The fix is to use a `UIView` wrapper
/// and redirect Fabric child mounting into `effectView.contentView`.
public final class GlassSurfaceView: UIView {

  // MARK: - React Props

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
    didSet { updateAppearance() }
  }

  public var fallbackOpacity: CGFloat = 0.85 {
    didSet { updateAppearance() }
  }

  public var reduceTransparencyFallbackColor: UIColor = UIColor.white.withAlphaComponent(0.85) {
    didSet { updateAppearance() }
  }

  // MARK: - Internal effect view

  /// The visual effect view that renders the glass/blur effect.
  /// React children are mounted into `effectView.contentView`, NOT into the wrapper.
  private let effectView: UIVisualEffectView

  // MARK: - Initialization

  override public init(frame: CGRect) {
    self.effectView = UIVisualEffectView(effect: nil)
    super.init(frame: frame)
    setupView()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setupView() {
    backgroundColor = .clear
    clipsToBounds = true
    isUserInteractionEnabled = true
    layer.cornerCurve = .continuous

    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effectView.clipsToBounds = true
    effectView.layer.cornerCurve = .continuous
    effectView.layer.cornerRadius = cornerRadius
    effectView.contentView.isUserInteractionEnabled = true

    super.addSubview(effectView)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleReduceTransparencyStatusDidChange(_:)),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )

    updateGeometry()
    updateAppearance()
  }

  // MARK: - Fabric child mounting

  /// React Native Fabric calls this to mount child component views.
  /// We redirect children into `effectView.contentView` so the glass effect
  /// renders behind the children (the whole point of UIVisualEffectView).
  @objc public func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    effectView.contentView.insertSubview(childComponentView, at: index)
  }

  /// React Native Fabric calls this to unmount child component views.
  @objc public func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }

  // MARK: - Layout

  override public func layoutSubviews() {
    super.layoutSubviews()
    updateGeometry()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Updates

  private func updateGeometry() {
    layer.cornerRadius = cornerRadius
    layer.masksToBounds = true
    effectView.layer.cornerRadius = cornerRadius
  }

  private func updateAppearance() {
    if UIAccessibility.isReduceTransparencyEnabled {
      effectView.effect = nil
      effectView.alpha = 1.0
      effectView.contentView.backgroundColor = reduceTransparencyFallbackColor
      return
    }

    effectView.contentView.backgroundColor = .clear

    if #available(iOS 26.0, *) {
      let glassEffect = UIGlassEffect(style: .regular)
      glassEffect.isInteractive = interactive
      glassEffect.tintColor = resolvedTintColor()
      effectView.effect = glassEffect
      effectView.alpha = 1.0
    } else {
      effectView.effect = UIBlurEffect(style: .systemMaterial)
      effectView.alpha = fallbackOpacity
    }
  }

  @objc private func handleReduceTransparencyStatusDidChange(_ notification: Notification) {
    updateAppearance()
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
}
