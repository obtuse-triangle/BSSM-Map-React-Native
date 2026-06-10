Pod::Spec.new do |s|
  s.name = "ExpoGlassSurface"
  s.version = "1.0.0"
  s.summary = "Expo module for Liquid Glass surface rendering on iOS"
  s.homepage = "https://github.com/expo/expo"
  s.license = "MIT"
  s.author = "650 Industries, Inc."
  s.platform = :ios, "15.1"
  s.source = { :git => "https://github.com/expo/expo.git" }
  s.static_framework = true
  s.dependency "ExpoModulesCore"
  s.swift_version = "5.4"
  s.source_files = "**/*.{h,m,swift}"
end
