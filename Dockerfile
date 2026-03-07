# 接收Actions传递的Python版本参数，默认3.10
ARG PYTHON_VERSION=3.10
FROM python:${PYTHON_VERSION}-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（避免编译失败）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 接收setuptools版本参数，强制安装
ARG SETUPTOOLS_VERSION=65.0.0
RUN pip install --no-cache-dir --upgrade pip \
    setuptools==${SETUPTOOLS_VERSION} \
    wheel \
    -i https://pypi.tuna.tsinghua.edu.cn/simple

# 安装项目依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制项目文件
COPY . .

# 暴露端口
EXPOSE 5001

# 启动命令
CMD ["python", "main.py"]