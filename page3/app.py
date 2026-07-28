from flask import Flask, request, jsonify, send_file
import json
import os
import logging

# 配置日志
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
# 直接使用Vocabulary.json文件作为数据存储
# 使用绝对路径
vocabulary_file = os.path.join(os.path.dirname(__file__), 'public', 'Vocabulary.json')
logging.info(f'Vocabulary file path: {vocabulary_file}')
logging.info(f'File exists: {os.path.exists(vocabulary_file)}')
if os.path.exists(vocabulary_file):
    logging.info(f'File size: {os.path.getsize(vocabulary_file)} bytes')

# 初始化数据文件
def init_data():
    # 检查Vocabulary.json文件是否存在
    if not os.path.exists(vocabulary_file):
        # 如果文件不存在，创建一个空的Vocabulary.json文件
        empty_data = []
        with open(vocabulary_file, 'w', encoding='utf-8') as f:
            json.dump(empty_data, f, indent=2, ensure_ascii=False)

# 初始化数据文件
init_data()

# 获取单词数据
@app.route('/api/words', methods=['GET'])
def get_words():
    try:
        logging.info('GET /api/words called')
        # 检查文件是否存在
        if not os.path.exists(vocabulary_file):
            logging.error(f'Vocabulary.json file not found at {vocabulary_file}')
            return jsonify({"error": "Vocabulary.json file not found"}), 404
        
        logging.info(f'Reading Vocabulary.json file at {vocabulary_file}')
        # 读取Vocabulary.json文件
        with open(vocabulary_file, 'r', encoding='utf-8') as f:
            vocabulary_data = json.load(f)
        
        # 检查数据格式
        if isinstance(vocabulary_data, list):
            # 旧格式：单词列表
            logging.info(f'Read {len(vocabulary_data)} words from Vocabulary.json (old format)')
            # 转换为新格式，将所有单词放入记忆区
            to_review_words = []
            for word_item in vocabulary_data:
                # 提取单词和翻译
                word = word_item.get('word', '')
                translations = word_item.get('translations', [])
                phrases = word_item.get('phrases', [])
                
                # 构建单词对象
                word_obj = {
                    "word": word,
                    "translations": translations,
                    "phrases": phrases,
                    "nextReviewDate": "",
                    "correctCount": 0,
                    "wrongCount": 0
                }
                to_review_words.append(word_obj)
            
            # 构建返回数据
            data = {
                "toReviewWords": to_review_words,
                "masteredWords": [],
                "untrainedWords": [],
                "vocabularyName": "词汇表"
            }
        elif isinstance(vocabulary_data, dict):
            # 新格式：包含分类信息的字典
            logging.info('Reading Vocabulary.json file (new format)')
            # 直接返回数据，确保所有必要字段存在
            data = {
                "toReviewWords": vocabulary_data.get('toReviewWords', []),
                "masteredWords": vocabulary_data.get('masteredWords', []),
                "untrainedWords": vocabulary_data.get('untrainedWords', []),
                "vocabularyName": vocabulary_data.get('vocabularyName', "词汇表")
            }
        else:
            logging.error(f'Invalid data format in Vocabulary.json: {type(vocabulary_data)}')
            return jsonify({"error": "Invalid data format in Vocabulary.json"}), 400
        
        logging.info(f'Returning data: toReviewWords={len(data["toReviewWords"])}, masteredWords={len(data["masteredWords"])}, untrainedWords={len(data["untrainedWords"])}')
        return jsonify(data)
    except json.JSONDecodeError as e:
        logging.error(f'Invalid JSON format: {str(e)}')
        return jsonify({"error": f"Invalid JSON format: {str(e)}"}), 400
    except Exception as e:
        logging.error(f'Failed to read data: {str(e)}', exc_info=True)
        return jsonify({"error": f"Failed to read data: {str(e)}"}), 500

# 保存单词数据
@app.route('/api/words', methods=['POST'])
def save_words():
    try:
        data = request.json
        # 保存完整的分类数据
        save_data = {
            "toReviewWords": data.get('toReviewWords', []),
            "masteredWords": data.get('masteredWords', []),
            "untrainedWords": data.get('untrainedWords', []),
            "vocabularyName": data.get('vocabularyName', "词汇表")
        }
        # 写入Vocabulary.json文件
        with open(vocabulary_file, 'w', encoding='utf-8') as f:
            json.dump(save_data, f, indent=2, ensure_ascii=False)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": "Failed to save data"}), 500

# 导出单词数据
@app.route('/api/words/export', methods=['GET'])
def export_words():
    try:
        # 读取Vocabulary.json文件
        with open(vocabulary_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # 创建临时文件
        temp_file = 'exported_words.json'
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return send_file(temp_file, as_attachment=True, download_name='wordData.json')
    except Exception as e:
        return jsonify({"error": "Failed to export data"}), 500

# 测试路由
@app.route('/test')
def test():
    return jsonify({"message": "Hello, World!"})

# 静态文件服务
@app.route('/')
def index():
    return send_file('public/word.html')

@app.route('/<path:path>')
def static_files(path):
    return send_file(f'public/{path}')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)
