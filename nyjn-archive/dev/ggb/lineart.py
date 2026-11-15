#!/usr/bin/env python3
"""把彩色的角色圖轉成線稿（白底、深色的線），給 fit.py 取中心線用。

兩個公開的模型，權重取自 Hugging Face 的 lllyasviel/Annotators：
  anime：netG.pth    ── Anime2Sketch 的 U-Net（Xiang 等，MIT），動畫風的圖用它，線最乾淨
  info ：sk_model.pth ── Informative Drawings（Chan 等，MIT），比較寫實的圖可以試它
網路結構照兩個專案公開的程式重寫，載入權重時 strict=True，結構不符會直接報錯。

用法：python3 lineart.py <白底的圖> <輸出的線稿.png> --weights <權重檔> [--model anime|info] [--size 1536]
"""
import argparse
import functools

import cv2
import numpy as np
import torch
import torch.nn as nn


class ResidualBlock(nn.Module):
    def __init__(self, n):
        super().__init__()
        self.conv_block = nn.Sequential(nn.ReflectionPad2d(1), nn.Conv2d(n, n, 3), nn.InstanceNorm2d(n), nn.ReLU(True),
                                        nn.ReflectionPad2d(1), nn.Conv2d(n, n, 3), nn.InstanceNorm2d(n))

    def forward(self, x):
        return x + self.conv_block(x)


class InfoGenerator(nn.Module):
    """Informative Drawings 的生成器。"""
    def __init__(self, input_nc=3, output_nc=1, n_res=3):
        super().__init__()
        self.model0 = nn.Sequential(nn.ReflectionPad2d(3), nn.Conv2d(input_nc, 64, 7), nn.InstanceNorm2d(64), nn.ReLU(True))
        m1, i = [], 64
        for _ in range(2):
            m1 += [nn.Conv2d(i, i * 2, 3, stride=2, padding=1), nn.InstanceNorm2d(i * 2), nn.ReLU(True)]
            i *= 2
        self.model1 = nn.Sequential(*m1)
        self.model2 = nn.Sequential(*[ResidualBlock(i) for _ in range(n_res)])
        m3 = []
        for _ in range(2):
            m3 += [nn.ConvTranspose2d(i, i // 2, 3, stride=2, padding=1, output_padding=1), nn.InstanceNorm2d(i // 2), nn.ReLU(True)]
            i //= 2
        self.model3 = nn.Sequential(*m3)
        self.model4 = nn.Sequential(nn.ReflectionPad2d(3), nn.Conv2d(64, output_nc, 7), nn.Sigmoid())

    def forward(self, x):
        return self.model4(self.model3(self.model2(self.model1(self.model0(x)))))


class UnetBlock(nn.Module):
    def __init__(self, outer, inner, input_nc=None, sub=None, outermost=False, innermost=False, norm=nn.BatchNorm2d):
        super().__init__()
        self.outermost = outermost
        bias = (norm.func if isinstance(norm, functools.partial) else norm) == nn.InstanceNorm2d
        input_nc = outer if input_nc is None else input_nc
        down = nn.Conv2d(input_nc, inner, 4, 2, 1, bias=bias)
        if outermost:
            model = [down, sub, nn.ReLU(True), nn.ConvTranspose2d(inner * 2, outer, 4, 2, 1), nn.Tanh()]
        elif innermost:
            model = [nn.LeakyReLU(0.2, True), down, nn.ReLU(True), nn.ConvTranspose2d(inner, outer, 4, 2, 1, bias=bias), norm(outer)]
        else:
            model = [nn.LeakyReLU(0.2, True), down, norm(inner), sub, nn.ReLU(True), nn.ConvTranspose2d(inner * 2, outer, 4, 2, 1, bias=bias), norm(outer)]
        self.model = nn.Sequential(*model)

    def forward(self, x):
        return self.model(x) if self.outermost else torch.cat([x, self.model(x)], 1)


class UnetGenerator(nn.Module):
    """pix2pix 的 U-Net；Anime2Sketch 用的是八層、InstanceNorm 的版本。"""
    def __init__(self, input_nc=3, output_nc=1, downs=8, ngf=64):
        super().__init__()
        norm = functools.partial(nn.InstanceNorm2d, affine=False, track_running_stats=False)
        b = UnetBlock(ngf * 8, ngf * 8, innermost=True, norm=norm)
        for _ in range(downs - 5):
            b = UnetBlock(ngf * 8, ngf * 8, sub=b, norm=norm)
        b = UnetBlock(ngf * 4, ngf * 8, sub=b, norm=norm)
        b = UnetBlock(ngf * 2, ngf * 4, sub=b, norm=norm)
        b = UnetBlock(ngf, ngf * 2, sub=b, norm=norm)
        self.model = UnetBlock(output_nc, ngf, input_nc=input_nc, sub=b, outermost=True, norm=norm)

    def forward(self, x):
        return self.model(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('out')
    ap.add_argument('--weights', required=True)
    ap.add_argument('--model', default='anime')
    ap.add_argument('--size', type=int, default=1536, help='推論時圖的高度；會取成 256 的倍數')
    a = ap.parse_args()
    bgr = cv2.imread(a.image, cv2.IMREAD_COLOR)
    H, W = bgr.shape[:2]
    k = a.size / H
    hn, wn = 256 * int(np.ceil(H * k / 256)), 256 * int(np.ceil(W * k / 256))
    rgb = cv2.cvtColor(cv2.resize(bgr, (wn, hn), interpolation=cv2.INTER_CUBIC), cv2.COLOR_BGR2RGB).astype(np.float32)
    sd = torch.load(a.weights, map_location='cpu', weights_only=True)
    sd = {key.replace('module.', ''): v for key, v in sd.items()}
    with torch.no_grad():
        if a.model == 'anime':
            net = UnetGenerator()
            net.load_state_dict(sd, strict=True)
            net.eval()
            y = net(torch.from_numpy(rgb / 127.5 - 1).permute(2, 0, 1)[None])[0, 0].numpy() * 127.5 + 127.5
        else:
            net = InfoGenerator()
            net.load_state_dict(sd, strict=True)
            net.eval()
            y = net(torch.from_numpy(rgb / 255).permute(2, 0, 1)[None])[0, 0].numpy() * 255
    line = cv2.resize(np.clip(y, 0, 255).astype(np.uint8), (W, H), interpolation=cv2.INTER_AREA)
    cv2.imwrite(a.out, line)
    print('線稿 %d×%d，推論尺寸 %d×%d，平均亮度 %.1f' % (W, H, wn, hn, line.mean()))


if __name__ == '__main__':
    main()
