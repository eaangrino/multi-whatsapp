{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = with pkgs; [
    nodejs_20
    electron
    # Electron runtime deps
    gtk3
    glib
    nss
    nspr
    atk
    at-spi2-atk
    cups
    libdrm
    mesa
    libxkbcommon
    alsa-lib
    dbus
    pango
    cairo
    expat
    xorg.libX11
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libXScrnSaver
    xorg.libXtst
  ];

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [
      pkgs.dbus
      pkgs.glib
      pkgs.gtk3
      pkgs.atk
      pkgs.pango
      pkgs.cairo
      pkgs.cups

      pkgs.libdrm
      pkgs.mesa

      pkgs.xorg.libX11
      pkgs.xorg.libXcursor
      pkgs.xorg.libXdamage
      pkgs.xorg.libXext
      pkgs.xorg.libXfixes
      pkgs.xorg.libXi
      pkgs.xorg.libXrandr
      pkgs.xorg.libXScrnSaver
      pkgs.xorg.libXtst
      pkgs.xorg.libXcomposite

      pkgs.nss
      pkgs.nspr
    ]}
  '';
}
