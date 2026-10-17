import { expect, test } from "@playwright/test";
import { terrainVertex } from "../../packages/ui/src/gravity/materials";
import { packField } from "../../packages/ui/src/gravity/field";
import { surfaceHeight, type Well } from "../../packages/ui/src/gravity/model";

test("the production vertex shader evaluates the final contribution beyond 256 on WebGL2", async ({
  page,
}, testInfo) => {
  const wells: Well[] = Array.from({ length: 257 }, (_, index) => ({
    id: `gpu-${index}`,
    label: String(index),
    kind: "host",
    hostId: null,
    sector: "test",
    x: index * 12,
    z: index % 3,
    radius: 1.7,
    depth: 4.5,
    aspect: 1.2,
    angle: 0.3,
    elevation: 0.7,
    profile: 0.9,
    attention: false,
  }));
  const last = wells.at(-1)!;
  const samples = [
    { x: last.x, z: last.z },
    { x: last.x + 1, z: last.z + 0.4 },
    { x: wells[128]!.x, z: wells[128]!.z },
  ];
  const packed = packField(
    wells,
    4096,
    () => [0.2, 0.6, 0.8],
    () => 0,
  );
  const result = await page.evaluate(
    ({ shader, field, width, height, columns, samples }) => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("Actual WebGL2 context unavailable");
      const vertex = gl.createShader(gl.VERTEX_SHADER)!;
      const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
      const program = gl.createProgram()!;
      const texture = gl.createTexture()!;
      const positions = gl.createBuffer()!;
      const feedback = gl.createBuffer()!;
      const transform = gl.createTransformFeedback()!;
      const vao = gl.createVertexArray()!;
      try {
        // Match Three's float, integer and field-sampler precision declarations.
        gl.shaderSource(
          vertex,
          "#version 300 es\nprecision highp float; precision highp int; precision highp sampler2D;\nuniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix; in vec3 position;\n#define varying out\n#define texture2D texture\n" +
            shader,
        );
        gl.shaderSource(
          fragment,
          "#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1.0);}",
        );
        for (const source of [vertex, fragment]) {
          gl.compileShader(source);
          if (!gl.getShaderParameter(source, gl.COMPILE_STATUS))
            throw new Error(
              gl.getShaderInfoLog(source) ?? "Shader compile failed",
            );
          gl.attachShader(program, source);
        }
        gl.transformFeedbackVaryings(
          program,
          ["vWorld"],
          gl.INTERLEAVED_ATTRIBS,
        );
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(
            gl.getProgramInfoLog(program) ?? "Shader link failed",
          );
        gl.useProgram(program);
        const identity = new Float32Array([
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        ]);
        for (const name of ["modelMatrix", "viewMatrix", "projectionMatrix"])
          gl.uniformMatrix4fv(
            gl.getUniformLocation(program, name),
            false,
            identity,
          );
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          width,
          height,
          0,
          gl.RGBA,
          gl.FLOAT,
          new Float32Array(field),
        );
        gl.uniform1i(gl.getUniformLocation(program, "uField"), 0);
        gl.uniform2f(
          gl.getUniformLocation(program, "uFieldSize"),
          width,
          height,
        );
        gl.uniform1i(gl.getUniformLocation(program, "uFieldColumns"), columns);
        gl.uniform1f(gl.getUniformLocation(program, "uTime"), 0);
        gl.uniform1f(gl.getUniformLocation(program, "uAmbient"), 0);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, positions);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array(samples.flatMap((point) => [point.x, 0, point.z])),
          gl.STATIC_DRAW,
        );
        const attribute = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transform);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, feedback);
        gl.bufferData(
          gl.TRANSFORM_FEEDBACK_BUFFER,
          samples.length * 3 * 4,
          gl.DYNAMIC_READ,
        );
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, feedback);
        gl.enable(gl.RASTERIZER_DISCARD);
        const capture = (count: number) => {
          gl.uniform1i(gl.getUniformLocation(program, "uCount"), count);
          gl.beginTransformFeedback(gl.POINTS);
          gl.drawArrays(gl.POINTS, 0, samples.length);
          gl.endTransformFeedback();
          const values = new Float32Array(samples.length * 3);
          gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
          const error = gl.getError();
          if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`);
          return samples.map((_, index) => values[index * 3 + 1]!);
        };
        return {
          complete: capture(257),
          truncated: capture(64),
          renderer: gl.getParameter(gl.RENDERER) as string,
        };
      } finally {
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.deleteTransformFeedback(transform);
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(positions);
        gl.deleteBuffer(feedback);
        gl.deleteTexture(texture);
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    },
    {
      shader: terrainVertex,
      field: Array.from(packed.data),
      width: packed.width,
      height: packed.height,
      columns: packed.columns,
      samples,
    },
  );
  for (const [index, point] of samples.entries()) {
    expect(result.complete[index]).toBeCloseTo(
      surfaceHeight(point.x, point.z, wells),
      3,
    );
    expect(result.truncated[index]).toBeCloseTo(
      surfaceHeight(point.x, point.z, wells.slice(0, 64)),
      3,
    );
  }
  expect(Math.abs(result.complete[0]! - result.truncated[0]!)).toBeGreaterThan(
    3,
  );
  await testInfo.attach("actual-gpu-field.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
});
