import connections from "@/lib/mesh/connections.json";

export const MESH_MODES = [
  { id: "full", label: "Full mesh" },
  { id: "contour", label: "Contour" },
  { id: "eyes", label: "Eyes / iris" },
  { id: "brows", label: "Brows" },
  { id: "mouth", label: "Mouth" },
];

export function connectionsFor(mode) {
  switch (mode) {
    case "eyes":
      return [
        ...connections.left_eye,
        ...connections.right_eye,
        ...connections.left_iris,
        ...connections.right_iris,
      ];
    case "brows":
      return [...connections.left_eyebrow, ...connections.right_eyebrow];
    case "mouth":
      return connections.lips;
    case "contour":
      return [
        ...connections.face_oval,
        ...connections.lips,
        ...connections.left_eye,
        ...connections.right_eye,
      ];
    default:
      return connections.tesselation;
  }
}

export function connectionsForRegion(region) {
  switch (region) {
    case "eyes":
      return connectionsFor("eyes");
    case "contour":
      return connections.face_oval;
    case "mouthBrows":
      return [...connectionsFor("brows"), ...connectionsFor("mouth")];
  }
}
