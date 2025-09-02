import RedisServerClient from "../../../clients/redis-server-client";
import { NodeOutputData } from ".";
import {
  Config,
  Img2ImgSettings,
  ToImgResponse,
} from "../../../clients/stable-diffusion-client";

type Input = Omit<Img2ImgSettings, "init_images"> & { image: string };

export default async function execute(
  _: Config,
  input: Input,
): Promise<NodeOutputData<ToImgResponse>> {
  let image = input.image;
  if (input.image.startsWith("https://")) {
    image = await getImage(input.image);
  }
  const redisServerClient = RedisServerClient.getInstance(
    process.env.REDIS_SERVER_URL,
    process.env.REDIS_SERVER_TOKEN,
  );
  const response = await redisServerClient.runAuto1111Prompt(
    {
      ...input,
      image,
    },
    "img2img",
  );
  const time = 0;
  const server = null;
  const output = !response.output ? response : response.output;
  return {
    _meta: {
      time,
      server,
    },
    parameters: input,
    data: output,
  };
}

async function getImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch image");
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}
