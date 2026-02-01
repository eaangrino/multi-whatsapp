{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    nodejs_22
    yarn
    electron
  ];

  # binario correcto
  ELECTRON_PATH = "${pkgs.electron}/bin/electron";

  # directorio BASE donde existe dist/
  ELECTRON_OVERRIDE_DIST_PATH = "${pkgs.electron}/bin";
}
