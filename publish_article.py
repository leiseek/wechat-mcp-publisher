#!/usr/bin/env python3
"""
微信公众号文章发布脚本
"""

import requests
import json
import sys
import os
import base64
from urllib.parse import quote

APP_ID = os.environ.get('WECHAT_APP_ID')
APP_SECRET = os.environ.get('WECHAT_APP_SECRET')

def get_access_token():
    """获取 access_token"""
    url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APP_ID}&secret={APP_SECRET}"
    resp = requests.get(url, timeout=10)
    data = resp.json()
    
    if 'access_token' in data:
        print(f"✅ 获取 access_token 成功")
        return data['access_token']
    else:
        print(f"❌ 获取 access_token 失败: {data}")
        return None

def upload_image(access_token, image_path):
    """上传图片到微信"""
    url = f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={access_token}"
    
    with open(image_path, 'rb') as f:
        files = {'media': f}
        resp = requests.post(url, files=files, timeout=30)
    
    data = resp.json()
    if 'url' in data:
        print(f"✅ 图片上传成功: {data['url']}")
        return data['url']
    else:
        print(f"❌ 图片上传失败: {data}")
        return None

def upload_news(access_token, title, content, author="", digest=""):
    """上传图文消息素材"""
    url = f"https://api.weixin.qq.com/cgi-bin/material/add_news?access_token={access_token}"
    
    articles = {
        "articles": [
            {
                "title": title,
                "thumb_media_id": "",  # 需要上传封面图
                "author": author,
                "digest": digest,
                "show_cover_pic": 1,
                "content": content,
                "content_source_url": "",
                "need_open_comment": 0,
                "only_fans_can_comment": 0
            }
        ]
    }
    
    resp = requests.post(url, json=articles, timeout=30)
    data = resp.json()
    
    if 'media_id' in data:
        print(f"✅ 图文素材上传成功: {data['media_id']}")
        return data['media_id']
    else:
        print(f"❌ 图文素材上传失败: {data}")
        return None

def publish_article(access_token, media_id):
    """发布文章"""
    url = f"https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token={access_token}"
    
    payload = {
        "media_id": media_id
    }
    
    resp = requests.post(url, json=payload, timeout=30)
    data = resp.json()
    
    if data.get('errcode') == 0:
        print(f"✅ 文章发布成功，publish_id: {data.get('publish_id')}")
        return True
    else:
        print(f"❌ 文章发布失败: {data}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 publish_article.py <title> <article_path>")
        return 1
    
    title = sys.argv[1]
    article_path = sys.argv[2]
    
    print("=" * 60)
    print("  微信公众号文章发布")
    print("=" * 60)
    print()
    
    # 获取 access_token
    access_token = get_access_token()
    if not access_token:
        return 1
    
    print()
    
    # 读取文章内容
    if not os.path.exists(article_path):
        print(f"❌ 文章文件不存在: {article_path}")
        return 1
    
    with open(article_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 这里需要处理内容中的图片上传
    # 简化版本：直接发布纯文本
    
    print(f"📄 文章标题: {title}")
    print(f"📄 文章路径: {article_path}")
    print()
    
    # 上传图文素材
    media_id = upload_news(access_token, title, content)
    if not media_id:
        return 1
    
    print()
    
    # 发布文章
    if publish_article(access_token, media_id):
        print()
        print("=" * 60)
        print("✅ 文章发布完成！")
        print("=" * 60)
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())
