import cv2
import numpy as np
import tkinter as tk
from tkinter import ttk
import threading

# ─────────────────────────────────────────────
#  Shared state
# ─────────────────────────────────────────────
params = {
    "bilateral_d": 9,
    "blur":        5,
    "canny_low":   50,
    "canny_high":  150,
    "clahe_clip":  3,
    "show_panel":  0,   # 0=Overlay 1=HSV 2=CLAHE 3=Canny
}

PANELS = ["Overlay Edges", "Saturación HSV", "CLAHE Gray", "Canny Edges"]

# ─────────────────────────────────────────────
#  Load image
# ─────────────────────────────────────────────
path = "estrato_3.jpg"
img  = cv2.imread(path)
if img is None:
    print("No se encontró la imagen.")
    exit()

# ─────────────────────────────────────────────
#  Processing
# ─────────────────────────────────────────────
def build_sky_mask(hsv: np.ndarray) -> np.ndarray:
    """
    Detecta píxeles de cielo azul:
      hue  ∈ [90, 130]  (escala OpenCV 0-179)
      sat  > 40
      val  > 80
    Dilata 5 px para cubrir halos en el borde cielo-roca.
    """
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]

    _, hLo  = cv2.threshold(h,  89, 255, cv2.THRESH_BINARY)
    _, hHi  = cv2.threshold(h, 130, 255, cv2.THRESH_BINARY_INV)
    _, sMsk = cv2.threshold(s,  40, 255, cv2.THRESH_BINARY)
    _, vMsk = cv2.threshold(v,  80, 255, cv2.THRESH_BINARY)

    sky = cv2.bitwise_and(cv2.bitwise_and(cv2.bitwise_and(hLo, hHi), sMsk), vMsk)
    k5  = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    return cv2.dilate(sky, k5)


def process(img, p):
    d        = max(1, p["bilateral_d"])
    b_val    = max(1, p["blur"])
    if b_val % 2 == 0: b_val += 1
    c_low    = max(1, p["canny_low"])
    c_high   = max(c_low + 1, p["canny_high"])
    cl_clip  = max(1, p["clahe_clip"])

    bi    = cv2.bilateralFilter(img, d, 75, 75)
    blur  = cv2.GaussianBlur(bi, (b_val, b_val), 0)
    gray  = cv2.cvtColor(blur, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=float(cl_clip), tileGridSize=(8, 8))
    cl1   = clahe.apply(gray)
    edges = cv2.Canny(cl1, c_low, c_high)

    overlay = img.copy()
    overlay[edges > 0] = (0, 255, 80)

    # ── HSV Saturation con sky mask + CLAHE local ─────────────────────────
    # NORM_MINMAX estira el rango pero la distribución de saturación de roca
    # sigue sesgada hacia valores bajos → todo azul en JET.
    # CLAHE redistribuye el histograma localmente, igual que hacemos con el
    # canal gris, para que las diferencias de saturación sean visibles.
    hsv  = cv2.cvtColor(bi, cv2.COLOR_BGR2HSV)
    sky  = build_sky_mask(hsv)
    sCh  = hsv[:, :, 1].copy()
    sCh[sky > 0] = 0                                       # eliminar cielo

    clahe_sat = cv2.createCLAHE(clipLimit=float(cl_clip), tileGridSize=(8, 8))
    sEnh = clahe_sat.apply(sCh)                            # redistribuir histograma
    sEnh[sky > 0] = 0                                      # re-enmascarar tras CLAHE

    hsv_map = cv2.applyColorMap(sEnh, cv2.COLORMAP_JET)
    hsv_map[sky > 0] = (0, 0, 0)                           # pintar cielo negro
    # ──────────────────────────────────────────────────────────────────────

    cl_bgr   = cv2.cvtColor(cl1, cv2.COLOR_GRAY2BGR)
    edge_bgr = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

    return [overlay, hsv_map, cl_bgr, edge_bgr]

def add_label(frame, text):
    out = frame.copy()
    cv2.rectangle(out, (0, 0), (len(text) * 13 + 16, 36), (0, 0, 0), -1)
    cv2.putText(out, text, (8, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 230, 120), 2)
    return out

# ─────────────────────────────────────────────
#  OpenCV display loop (background thread)
# ─────────────────────────────────────────────
def cv_loop():
    cv2.namedWindow("Quantum Robotics | Estratigrafía", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Quantum Robotics | Estratigrafía", 1000, 650)

    while True:
        panels = process(img, params)
        idx    = params["show_panel"]
        frame  = add_label(panels[idx], PANELS[idx])

        bar = np.zeros((40, frame.shape[1], 3), dtype=np.uint8)
        txt = (f"  BilD={max(1,params['bilateral_d'])}  "
               f"Blur={max(1,params['blur'])}  "
               f"CannyLow={max(1,params['canny_low'])}  "
               f"CannyHigh={max(params['canny_low']+1,params['canny_high'])}  "
               f"CLAHE={max(1,params['clahe_clip'])}   "
               f"[S] Guardar  [Q] Salir")
        cv2.putText(bar, txt, (6, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (120, 180, 120), 1)

        display = np.vstack((frame, bar))
        cv2.imshow("Quantum Robotics | Estratigrafía", display)

        key = cv2.waitKey(30) & 0xFF
        if key == ord('q'):
            root.quit()
            break
        elif key == ord('s'):
            out_path = "stratigraphy_result.png"
            cv2.imwrite(out_path, display)
            print(f"[✓] Guardado: {out_path}")

    cv2.destroyAllWindows()

# ─────────────────────────────────────────────
#  Tkinter dark control panel
# ─────────────────────────────────────────────
BG      = "#0d1117"
BG2     = "#161b22"
ACCENT  = "#00e676"
FG      = "#e6edf3"
FG_DIM  = "#8b949e"
BORDER  = "#30363d"

SLIDER_DEFS = [
    ("Bilateral D",   "bilateral_d",  1, 30,  9),
    ("Gaussian Blur", "blur",         1, 21,  5),
    ("Canny Low",     "canny_low",    1, 254, 50),
    ("Canny High",    "canny_high",   2, 255, 150),
    ("CLAHE Clip",    "clahe_clip",   1, 10,  3),
]

sliders_store = {}  # key -> (IntVar, val_label)

def build_gui(root):
    root.title("Control Panel — Quantum Robotics")
    root.configure(bg=BG)
    root.resizable(False, False)

    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("TScale",
                    background=BG2,
                    troughcolor=BORDER,
                    sliderlength=18,
                    sliderrelief="flat")
    style.map("TScale", background=[("active", BG2)])

    # Header accent bar
    tk.Frame(root, bg=ACCENT, height=4).pack(fill="x")

    # Title
    title_frame = tk.Frame(root, bg=BG, pady=14)
    title_frame.pack(fill="x", padx=24)
    tk.Label(title_frame, text="⬡  STRATIGRAPH ANALYZER",
             font=("Courier New", 13, "bold"),
             fg=ACCENT, bg=BG).pack(anchor="w")
    tk.Label(title_frame, text="Quantum Robotics · URC 2026",
             font=("Courier New", 9), fg=FG_DIM, bg=BG).pack(anchor="w")

    tk.Frame(root, bg=BORDER, height=1).pack(fill="x")

    # ── Sliders ─────────────────────────────
    tk.Label(root, text="  PARÁMETROS",
             font=("Courier New", 8), fg=FG_DIM, bg=BG).pack(anchor="w", padx=16, pady=(12,0))

    for lbl_text, key, lo, hi, default in SLIDER_DEFS:
        row = tk.Frame(root, bg=BG2, pady=8, padx=16)
        row.pack(fill="x", pady=3, padx=16)

        top = tk.Frame(row, bg=BG2)
        top.pack(fill="x")
        tk.Label(top, text=lbl_text,
                 font=("Courier New", 9, "bold"),
                 fg=FG_DIM, bg=BG2).pack(side="left")

        val_lbl = tk.Label(top, text=str(default),
                           font=("Courier New", 10, "bold"),
                           fg=ACCENT, bg=BG2, width=4, anchor="e")
        val_lbl.pack(side="right")

        var = tk.IntVar(value=default)

        def on_change(v, k=key, lbl=val_lbl, vr=var):
            val = int(float(v))
            params[k] = val
            lbl.config(text=str(val))

        ttk.Scale(row, from_=lo, to=hi, orient="horizontal",
                  variable=var, command=on_change,
                  style="TScale").pack(fill="x", pady=(4, 0))

        sliders_store[key] = (var, val_lbl)

    tk.Frame(root, bg=BORDER, height=1).pack(fill="x", pady=(14, 0))

    # ── Panel selector ───────────────────────
    tk.Label(root, text="  VISTA ACTIVA",
             font=("Courier New", 8), fg=FG_DIM, bg=BG).pack(anchor="w", padx=16, pady=(12,0))

    btn_row  = tk.Frame(root, bg=BG, padx=16)
    btn_row.pack(fill="x", pady=(8, 0))
    btn_refs = []

    def select_panel(idx):
        params["show_panel"] = idx
        for i, b in enumerate(btn_refs):
            b.config(bg=ACCENT if i == idx else BG2,
                     fg=BG     if i == idx else FG_DIM,
                     font=("Courier New", 8, "bold" if i == idx else "normal"))

    for i, name in enumerate(["Overlay", "HSV Sat", "CLAHE", "Canny"]):
        b = tk.Button(btn_row, text=name,
                      font=("Courier New", 8),
                      bg=BG2, fg=FG_DIM,
                      activebackground=ACCENT, activeforeground=BG,
                      relief="flat", bd=0, padx=12, pady=7,
                      cursor="hand2",
                      command=lambda i=i: select_panel(i))
        b.pack(side="left", padx=3)
        btn_refs.append(b)
    select_panel(0)

    tk.Frame(root, bg=BORDER, height=1).pack(fill="x", pady=(14, 0))

    # ── Action buttons ───────────────────────
    action_row = tk.Frame(root, bg=BG, pady=14, padx=16)
    action_row.pack(fill="x")

    def save_action():
        panels = process(img, params)
        frame  = add_label(panels[params["show_panel"]], PANELS[params["show_panel"]])
        cv2.imwrite("stratigraphy_result.png", frame)
        save_btn.config(text="✓  Guardado!")
        root.after(1500, lambda: save_btn.config(text="[ S ]  Guardar PNG"))

    def reset_action():
        for _, key, _, _, default in SLIDER_DEFS:
            var, lbl = sliders_store[key]
            var.set(default)
            params[key] = default
            lbl.config(text=str(default))

    save_btn = tk.Button(action_row, text="[ S ]  Guardar PNG",
                         font=("Courier New", 9, "bold"),
                         bg=ACCENT, fg=BG,
                         activebackground="#00ff8c", activeforeground=BG,
                         relief="flat", bd=0, padx=14, pady=8,
                         cursor="hand2", command=save_action)
    save_btn.pack(side="left", padx=(0, 8))

    tk.Button(action_row, text="↺  Reset",
              font=("Courier New", 9),
              bg=BG2, fg=FG_DIM,
              activebackground=BORDER, activeforeground=FG,
              relief="flat", bd=0, padx=14, pady=8,
              cursor="hand2", command=reset_action).pack(side="left")

    tk.Label(root, text="[Q] en la imagen para salir",
             font=("Courier New", 7), fg=BORDER, bg=BG).pack(pady=(4, 12))


# ─────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────
root = tk.Tk()
build_gui(root)

cv_thread = threading.Thread(target=cv_loop, daemon=True)
cv_thread.start()

root.mainloop()
cv2.destroyAllWindows()
